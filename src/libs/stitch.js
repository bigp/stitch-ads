"use strict";

const spritesmith = require('spritesmith');
const sse = require('./server_sse');
const utils = require("./utils");
const async = require("async");
const path = require('path');
const prompt = require('prompt');
const uglyJS = require("uglify-js");
const uglyCSS = require("uglifycss");
const anymatch = require("anymatch");
const mkdirp = require('mkdirp');
const Datauri = global.Datauri = require('datauri');
const audiohub = require('./audiohub');
const play = new audiohub();
const ncp = require('ncp');
const fs = require('fs');
const yargs = require('yargs');
const webshot = require('webshot');
const inquirer = require('inquirer');

//Networking:
const express = require('express');
const app = express();
const port = 3333;

global.__stitch = path.resolve( __dirname, '..' ).fixSlashes();

const MATCHER_ADS_NAMES = anymatch("^(en|fr)([a-zA-Z_]*)[0-9]*x[0-9]*");

const commands = yargs
        .alias('p','production')
        .alias('r', 'render')
        .alias('v', 'verbose')
        .alias('o', 'overwrite')
        .alias('z', 'zip')
        .alias('q', 'quick')
        .alias('t', 'port')
        .alias('i', 'init')   
        .number('r')
        .argv;

function WARN(str)  { commands.verbose >= 0 && trace(str.red); }
function INFO(str)  { commands.verbose >= 1 && trace(str.cyan); }
function DEBUG(str) { commands.verbose >= 2 && trace(str.yellow); }

const __assets = path.resolve(__stitch, 'assets/').fixSlashes() +'/';
trace(__assets);
const ASSETS = wrapKeysWith(require('./assets'), __assets);

//const soundsLoaded = {};
function playSound(str) {
    play.play(str, ()=>{});
}

const isZip = commands.zip;
const isQuick = commands.quick;
const isProd = commands.production || isZip;
const exceptionStr = isProd ? '/_dev/' : '/_prod/';

const lastSettingsFile = __project + "/.git/stitch-last.json";
var lastSettings = jsonTry(lastSettingsFile, {
    primaryFocus: 0
});

function initializeFolders() {
    trace("Finding filenames (txt file)...");
    var textFiles = fileFilter(__project, file => /\.txt/.test(file));
    var __ads = __project + "/ads/";
	
	var questions = [
		{
			type: 'checkbox',
			message: "Create these subfolders for each ads?",
			name: 'subfolders',
			choices: [
				{name: 'images', checked: true},
				{name: 'jpegs', checked: true}
			]
		}
	];
    
    function parseTextFileForFolderNames(file) {
        var content = fileRead(file);
        var lines = content.split('\r');
        var filenames = lines
            .map(file => file.trim())
            .filter(file => MATCHER_ADS_NAMES(file));
        
		filenames.forEach(file => {
			var adDir = __ads + file;
			
			var doesExists = fileExists(adDir) ? '[x] ' : '[ ] ';
            trace(doesExists + file);
        });
		
		trace(" ");
		
		inquirer
			.prompt(questions)
			.then(answers => {
				makeSubfolders(filenames, answers.subfolders, () => {
					process.exit();
				});
			});
    }
	
	function makeSubfolders(filenames, subdirs, cb) {
		var count = filenames.length;
		
		filenames.forEach(file => {
			var adDir = __ads + file;
			
			trace("Making sub-folder: " + file);
			mkdirp(adDir, (err) => {
				makeOtherSubfolders(adDir);
				
				if((--count)<=0) {
					setTimeout(() => {
						cb && cb();
					}, 250)
				}
			});
		});
		
		function makeOtherSubfolders(adDir) {
			subdirs.forEach( subdir => {
				mkdirp(adDir+"/"+subdir);
			})
		}
	}
    
    if(textFiles.length==0) {
        throw new Error("Missing text files defining all the ads filenames!");
    } else if(textFiles.length>1) {
        textFiles.forEach( (file, id) => trace(id + ": " + file));
        trace("Which file should this use?");
        prompt.start();
        prompt.get({name: 'whichFile'}, (err, result) => {
            if(err) throw err;
            result.whichFile = parseInt(result.whichFile);
            parseTextFileForFolderNames(textFiles[result.whichFile]);
        });
        
    } else parseTextFileForFolderNames(textFiles[0]);
}

global.pngquantCompress = function pngquantCompress( img, quality, cb ) {
    function _imageminBuffer(img, quality) {
        imageminBuffer(img, quality)
        .then( cb )
        .catch( err => {
            trace(('PNGQuant failed with quality: ' + quality).red);
            imageminBuffer(img, '50-100')
                .then( cb )
                .catch( baderr=> {
                    trace(("imageminBuffer FAILED: " + baderr).red);
                    throw baderr;
                });
        });
    }

    if(!__.isString(img)) {
        return _imageminBuffer(img, quality, cb);
    }

    //Read the file-buffer if a URL was supplied instead:
    fs.readFile(img, (err, data) => {
        if(err) throw err;
        _imageminBuffer(data, quality, cb);
    });
};

function getImages(folder) {
    return fileFilter(folder, file => /\.(png|jpg|gif)/.test(file));
}

function tryStepFunc(func, step) {
    if(!func) return step();
    
    if(func.length>0) {
        func(step);
    } else {
        func();
        step();
    }
}

//Stitch Constructor:
class stitch {
    constructor() {
        this._ads = {};
        this._watcher = require("watchr");
        
        this.events = new EventEmitter();
        
        this._sse = sse.configSSE(app, {
            callback() {
                return 'refresh-sse';
            }
        });
    }

    watchFolders(folderNames, publicFolder) {
        if(__.isString(folderNames)) folderNames = [folderNames];
        
        var _this = this;
        
        this._publicFolder = publicFolder;
        
        this._watcher.watch({
            paths: folderNames,
            listeners: {
                error(err) {
                    trace("Error occured: " + err);
                },
                
                change(changeType, fullpath) {
                    var badExtensions = "ts,less,hx".split(',');
                    var badPaths = ["/__files"];
                    
                    //Skip re-builds for any files created in public folder:
                    var partpath = fullpath.fixSlashes().replace(__project, '');
                    var filename = partpath.split('/').pop();
                    var isPublic = partpath.indexOf('/public/')>-1;
                    var isHidden = filename.indexOf('.')==0 || partpath.indexOf('/.')>-1;
                    var isBadExt = badExtensions.indexOf(filename.split('.').pop())>-1;
                    var isBadPath = false;
                    badPaths.forEach( bad => {
                        if(fullpath.indexOf(bad)>-1) {
                            trace(("BAD PATH!!! " + fullpath).red);
                            isBadPath = true;
                        }
                    });
                    
                    if(!_this._isReady || isPublic || isHidden || isBadExt || isBadPath) return;
                    
                    trace("File changed: " + fullpath);
                    
                    _this.prepareBuild();
                }
            },
            
            next(err, watchers) {
                if(err) return trace("Watching everything failed: ", err);
                _this._watchers = watchers;
            }
        });

        app.get('/', (req, res) => {
            if(!_this._primaryAd) {
                res.send("No primary ad selected yet.");
                return;
            }

            res.sendFile(_this._primaryAd.outputHTML);
        });

        var __public = __project + '/public';

        app.use('/*.php', function(req, res, next) {
            var phpPath = __public +  req.baseUrl;

            if(!fileExists(phpPath)) {
                return res.send("ERROR!");
            }

            phpExec(phpPath, (output) => {
                res.send(output);
            });

            return;
        });

        app.use(express.static(__public));
        
        app.listen(commands.port || port);
    }
    
    //This signals the process to re-build the files in /public/ after a brief delay.
    prepareBuild() {
        var _this = this;
        
        if(_this._buildPending!=null) {
            clearTimeout(_this._buildPending);
        }


        _this._buildPending = setTimeout(()=> {
            _this._buildPending = null;
            _this.build();
        }, _this.config && _this.config.delay!=null ? _this.config.delay  : 250);
    }
    
    watchStop() {
        this._watchers && this._watchers.forEach(w=>w.close());
    }

    assembleForEach(dirOfDirs, config, cb) {
        trace(dirOfDirs.red+'\n');
        var _this = this;

        _this._assembleDir = dirOfDirs;
        _this._assembleConfig = __.merge({js: ['**/*.js'], css: ['**/*.css']}, config);
        
        var rgxDimensions = /[0-9]*x[0-9]*/i;
        
        function recursiveDirFind(dirsStr) {
            var dirs = getDirs(dirsStr);

            dirs.forEach(fullpath => {
                var filename = fullpath.replace(_this._assembleDir+'/','');
                var shortname = fullpath.split('/').pop();
                
                if (isDirEmpty(fullpath) || filename.indexOf('.')==0) return;
                if(!MATCHER_ADS_NAMES(shortname)) {
                    return recursiveDirFind(fullpath); 
                }

                var ad = _this._ads[filename] = {
                    filename: filename,
                    fullpath: fullpath,
                    shortname: shortname
                    //basepath: fullpath.substr(0, fullpath.lastIndexOf('/'))
                };

                var dimensions = filename.match(rgxDimensions);
                if (dimensions) {
                    var dims = dimensions[0].split('x');
                    ad.width = dims[0] | 0;
                    ad.height = dims[1] | 0;
                }

                if(ad.width!=null) ad.borderWidth = ad.width-2;
                if(ad.height!=null) ad.borderHeight = ad.height-2;
            });
        }
        
        recursiveDirFind(dirOfDirs);

        playSound(ASSETS.SOUNDS.PROMPT);
        
        var adNames = __.keys(_this._ads);
        
        if(adNames.length==0 || commands.init) {
            _this.watchStop();
            return initializeFolders();
        }
        
        //This helps to sort the ad-names like Windows Explorer's file list does:
        adNames.sort((a,b)=>{
            var adA = _this._ads[a];
            var adB = _this._ads[b];
            var pathA = adA.fullpath.replace(__project, '');
            var pathB = adB.fullpath.replace(__project, '');
            pathA = pathA.split('/').slice(0, -1).join('/');
            pathB = pathB.split('/').slice(0, -1).join('/');
            if(pathA!=pathB) return pathA.localeCompare(pathB);
            
            var wDiff = adA.width - adB.width;
            var hDiff = adA.height - adB.height;
            if(wDiff==0 && hDiff==0) {
                return a.localeCompare(b);
            }
            
            return wDiff!=0 ? wDiff : hDiff;
        });

        trace("Which is the primary AD (to focus on, ie: the index.html document)?\n".cyan);
        adNames.forEach((adName, i) => {
            trace(" * {0}: {1}".format((i<10 ? " " : "")+i, adName).cyan);
        });
        trace("\n  (Enter any invalid entry to build ALL ads.)\n");
        //adNames
        
        prompt.start();
        prompt.get([{name: 'ad', 'default': lastSettings.ad}], (err, result) => {
            if(err) throw err;

            _this._isReady = true;
            
            //cb && cb(result);
            if(!result.ad) result.ad = 0;
            
            if(isNaN(result.ad) || result.ad<0 || result.ad >= adNames.length) {
                trace("Building All!");
                playSound(ASSETS.SOUNDS.BUILD_ALL);
                _this._primaryAd = null;
            } else {
                var adName = adNames[lastSettings.ad = result.ad];
                _this._primaryAd = _this._ads[adName];

                playSound(ASSETS.SOUNDS.BUILD_SINGLE);
                //Remember setting for next re-launch:
                jsonWrite(lastSettingsFile, lastSettings);
            }
            
            //Collect & uglify the JS and CSS files for each ads, and creates an HTML file with it:
            _this.build();
        });
    }
    
    build() {
        var _this = this;
        var ads = _this._ads;
        var templateSrc;
        var adNames = __.keys(ads);
        var commonImages;
        
        traceClear();
        
        if(_this._primaryAd) {
            trace("Serving '{0}' on http://localhost:3333/\n\n".format(_this._primaryAd.filename).yellow);

            adNames = adNames.filter(adName => adName==_this._primaryAd.filename);
        }
        trace((isProd ? "--PROD--" : "--DEV--") + " Building {0} ads...".format(adNames.length));
        
        async.series([
            // Get the INDEX.HTML file and it's content, wherever it's first found in the project directory:
            (step) => {
                var templateIndexes = fileFilter(__project, (file, fullpath) => {
                    if(fullpath.indexOf('/public')>-1 || fullpath.indexOf(exceptionStr)>-1) return false;
                    return file=="index.html";
                });
                
                if(templateIndexes==null || templateIndexes.length==0) {
                    throw new Error("No template index.html file found!");
                }
                
                trace("Using index.html found in: " + templateIndexes[0].replace(__project, '...'));
                fileRead( templateIndexes[0], (err, content, file) => {
                    if(err) throw err;

                    templateSrc = content;

                    step();
                });
            },

            // Get the local STITCH-CONFIG.JS file:
            (step) => {
                var __stitchConfig = __project + '/stitch-config.js';
                var config = {};
                if(fileExists(__stitchConfig)) {
                    config = require(__stitchConfig);
                }
                
                _this.config = __.merge({delay: 250, quality: '90-100', padding: 4, useDataURI: true}, config);
                
                trace("Config: " + JSON.stringify(_this.config, null, '  '));
                
                step();
            },
            
            (step) => {
                //Call the preCompile process separetely
                tryStepFunc(_this.config.preCompile, step);
            },
            
            //Find any "defines.js" file to include, and merge it's properties with those already
            //stored for each ads objects.
            (step) => {
                var definesFile = null, def = "/defines.js";
                [_this._assembleDir + def].forEach(defines => {
                    if(fileExists(defines)) definesFile = defines;
                });
                
                if(!definesFile) {
                    if(!_this.config.defines) {
                        trace("Error, could not find 'defines.js' file!".red);
                        return step();
                    }
                    
                    //trace("Using defines in the stitch-config.js file.".yellow);
                    _this.defines = _this.config.defines;
                } else {
                    _this.defines = require(definesFile);
                    trace("Found define file: ".yellow + definesFile);
                }
               
                var _default = _this.defines._default;
                adNames.forEach(adName => {
                    var ad = ads[adName];

                    ads[adName] = __.mergeWith(ad, _default, _this.defines[ad.filename], _this.defines[ad.shortname]);
                });
                
                step();
            },

            //Resolve the outputHTML path (how it should write the "index.html" or "{{filename}}.html" file).
            (step) => {
                var conf = _this.config;

                adNames.forEach(adName => {
                    var ad = ads[adName];

                    var outputHTML = replaceBrackets( conf.outputHTML || "{{filename}}.html", ad );
                    outputHTML = (__public + "/" + outputHTML).fixSlashes();

                    ad.outputHTML = outputHTML;
                    ad.outputPath = outputHTML.substr(0,outputHTML.lastIndexOf('/'));
                });

                step();
            },

            //Copy any assets folders / files per ads:
            (step) => {
                if(isQuick) return step();
				
				var count = adNames.length;
                function doNext() { if((--count)<=0) step(); }
                
                adNames.forEach(adName => {
                    var ad = ads[adName];
                    var assetsPath = ad.fullpath + '/assets';
                    if(!fileExists(assetsPath)) return doNext();
                    
                    var assetFiles = fileFilter(assetsPath, file => true);

                    if(!checkFilesSum(ad, 'assets', assetFiles)) {
                        trace("Assets are all up-to-date for {0}.".format(adName).red);
                        return doNext();
                    }
                    
					//NCP ???? Oh file copy... ok.
                    ncp(assetsPath, ad.outputPath, err => {
                        if(err) throw err;
                        
                        trace("Copied assets over for {0}.".format(adName).yellow);
                        doNext();
                    });
                });
            },

            (step) => {
                if(isQuick) return step();
				
				//Create atlas of COMMON images:
				var commonImagesPath = __project + '/_common/images';
                if(!fileExists(commonImagesPath)) {
                    commonImages = [];
                    return step();
                }

                commonImages = getImages(commonImagesPath);

                step();
            },
            
            //Create a spritesheet/atlas & JS coordinate file for each ads' images.
            (step) => {
                if(isQuick) return step();
				
				var count = adNames.length;
                function doNext() { if((--count)<=0) step(); }
                
                adNames.forEach(adName => {
                    var ad = ads[adName];
                    var imagesPath = ad.fullpath+'/images';
                    
                    function noImage() {
                        trace("No images for ad {0}.".format(adName).red);
                        ad.atlas = "{}";
                        doNext();
                    }
                    
                    if(!fileExists(imagesPath)) {
                        return noImage();
                    }
                    
                    var sprites = [].concat(commonImages, getImages(imagesPath));
                    
                    if(!sprites || !sprites.length) return noImage();
                    
                    ad.atlasName = ad.filename+ '-atlas.png';
                    ad.atlasPath = (__public + "/" + ad.atlasName).fixSlashes();
                    
                    if(!checkFilesSum(ad, 'atlas', sprites)) {
                        trace("Skipping atlas generation (using cached version)".red);
                        return doNext();
                    }

                    spritesmith.run({src: sprites, padding: _this.config.padding}, (err, result) => {
                        if(err) throw err;

                        trace("Spritesheet make: ".green + adName);

                        var frames = [], anims = {};

                        result.coordinates = remapKeys(result.coordinates, (fullpath) => {
                            return fullpath.split('/').pop().replace('.png', '');
                        });
                        
                        __.keys(result.coordinates).forEach(shortname => {
                            var c = result.coordinates[shortname];
                            anims[shortname] = frames.length;
                            frames.push( [c.x, c.y, c.width, c.height] ); //, 0, c.width>>1, c.height>>1] );
                        });

                        trace("imageminBuffer started... " + adName);

                        pngquantCompress( result.image, _this.config.quality, image => {
                            var atlasOutput;

                            trace("imageminBuffer completed... " + adName);

                            if(_this.config.useDataURI) {
                                var datauri = new Datauri();
                                datauri.format('.png', image);
                                atlasOutput = datauri.content;
                            } else {
                                atlasOutput = ad.atlasPath;
                                fs.writeFileSync( atlasOutput, image );
                            }
                            
                            if(_this.config.onAtlas) {
                                var customAtlas = _this.config.onAtlas(ad, result);
                                ad.atlas = JSON.stringify(customAtlas);
                            } else {
                                trace("Create atlas for \"{0}\"".format(adName).yellow);
                                
                                ad.atlas = JSON.stringify({
                                    size: result.properties,
                                    images: [atlasOutput.replace(__public + '/', '')],
                                    frames: frames,
                                    animations: anims
                                });
                            }
                            
                            if(_this.config.useExternalJSON) {
                                var jsonPath = ad.atlasPath.replace('.png', '.json');
                                trace("Wrote JSON atlas externally:\n" + jsonPath.yellow);
                                fileWrite(jsonPath, ad.atlas);
                            }

                            doNext();
                        });
                    })
                });
            },
            
            //Execute any 'pre-compilation' callbacks:
            (step) => {
                if(isQuick) return step();
				
				if(_this.config.preCompileEach) {
                    adNames.forEach(adName => {
                        var ad = _this._ads[adName];
                        _this.config.preCompileEach(ad);
                    });
                }
                
                step();
            },
            
            //Create the HTML file for each ads:
            (step) => {
                if(isQuick) return step();
				
				var count = adNames.length;

                trace("Create HTML files...");

                //For each ads, collect the JS and CSS files:
                adNames.forEach(adName => {
                    if(count==0) {
                        throw new Error("Count reached zero already? " + adName);
                    }
                    
                    trace("Processing: " + adName);
                    
                    var filesByType = {};
                    var ad = _this._ads[adName];
                    var confCopy =  __.cloneDeep(_this._assembleConfig);

                    //Set converters to UGLIFY (or Merge for dev builds) the JS and CSS files:
                    var converters = {
                        js(files) {
                            if(isProd) {
                                var ugly = {code: ''};
                                try {
                                    ugly = uglyJS.minify(files);
                                } catch(err) {
                                    trace(("Error uglifying JS code: \n - "+files.join('\n - ')).red);
                                    throw err;
                                }
                                return ugly.code;
                            }
                            return fileMerge(files)
                        },
                        css(files) {
                            if(isProd) return uglyCSS.processFiles(files, {
                                mangle: true,
                                compress: {
                                    dead_code: true,
                                    global_defs: {DEBUG: false}
                                }
                            });
                            return fileMerge(files)
                        }
                    };
                    
                    __.keys(confCopy).forEach( type => {
                        var matcherPattern = replaceBrackets(confCopy[type], ad);

                        var matcher = anymatch(matcherPattern);

                        var files = filesByType[type] = fileFilter(__project, (file, fullpath) => {
                            return fullpath.indexOf(exceptionStr)==-1 && (matcher(file) || matcher(fullpath));
                        });

                        if(files.length==0) {
                            ad[type] = '';
                            return;
                        }

                        //Prioritize the 'common' files first above the ads-specific files:
                        files.sort((a, b) => {
                            var c = '_common';
                            if(a.contains(c) && !b.contains(c)) return -1;
                            if(!a.contains(c) && b.contains(c)) return 1;
                            return 0;
                        });
                        
                        var cleanFiles = files.map( f => f.split('/').pop());
                        trace(' {0}({1}) = {2}'.format(type, cleanFiles.length, cleanFiles.join(', ')));
                        
                        var typeCode = replaceBrackets( converters[type]( files ), ad)[0];

                        var externalFile = _this.config[type + 'File'];
                        if(externalFile) {
                            var externalFullpath = __public + "/" + externalFile;
                            fileWrite(externalFullpath, typeCode, (err) => {
                                if(err) {
                                    trace("Could not write '{0}' file to: ".format(type).red + "\n" + externalFullpath);
                                    throw err;
                                }
                                trace("Wrote {0} externally:\n".format(type) + externalFullpath.yellow);
                            });
                            ad[type] = '';
                        } else {
                            ad[type] = typeCode;
                        }
                    });
                    
                    if(_this.config.compileEach) {
                        _this.config.compileEach(ad);
                    }
                    
                    var resultHTML = replaceBrackets(templateSrc, ad);
                    ad.outputHTMLContent = resultHTML[0];
                    mkdirp(ad.outputPath);
                    fileWrite(ad.outputHTML, ad.outputHTMLContent, (err) => {
                        if (err) throw err;
                        if ((--count) <= 0) step();
                    });
                });
            },

            (step) => {
				if(isQuick) return step();
				
                if(_this.config.postCompileEach) {
                    adNames.forEach(adName => {
                        var ad = _this._ads[adName];
                        _this.config.postCompileEach(ad);
                    });
                }

                step();
            },
            
            (step) => {
                if(!isZip) return step();

                var count = adNames.length;
                function doNext() { if((--count)<=0) step(); }
                
                trace("Writing ZIPs...".yellow);
                const NodeZip = require('node-zip'); 
                
                adNames.forEach(adName => {
                    var ad = _this._ads[adName];
                    var htmlName = ad.outputHTML.split('/').pop();
                    var zip = new NodeZip();
                    ad.outputZIP = ad.outputHTML.replace('.html', '.zip');
                    
					if(!ad.outputHTMLContent) {
						if(!fileExists(ad.outputHTML)) {
							throw new Error("Missing HTML file! " + ad.outerHTML);
						}
						
						ad.outputHTMLContent = fileRead(ad.outputHTML);
					}
					
                    zip.file(htmlName, ad.outputHTMLContent);
                    var data = zip.generate({base64:false,compression:'DEFLATE'});
                    fs.writeFile(ad.outputZIP, data, 'binary', (err) => {
                        if(err) {
                            trace("Error making zip file...".red);
                            throw err;
                        }
                        doNext();
                    });
                });
            },
            
            (step) => {
                if(isQuick || !commands.render || commands.render<1) {
                    return step();
                }
                
                trace("Starting rendering, with timeout of: {0}ms.".format(commands.render).yellow);
                
                var count = adNames.length;
                function doNext() { if((--count)<=0) step(); }
                
                adNames.forEach( adName => {
                    var ad = _this._ads[adName];
                    
                    var url = 'http://localhost:3333/' + ad.filename + '.html?end=1';
                    var pngDest = ad.outputHTML.replace('.html', '.png').replace('/public', '/.backupJPGs');
                    var pngTemp = pngDest.replace(".png", ".temp.png");
                    //var PNGCrop = require('png-crop');
                    
                    trace("Rendering... ".yellow + url);

                    var sizeOptions = {width: ad.width, height: ad.height};
                    var webOptions = {
                        screenSize: sizeOptions,
                        shotSize: sizeOptions,
                        renderDelay: commands.render || 500,
                        userAgent: 'Chrome/37.0.2062.120',
                        phantomConfig: {
                            'ignore-ssl-errors': true
                        }
                    };

                    webshot(url, pngDest, webOptions, function(err) {
                        if(err) {
                            console.error("Could not load / take screenshot of URL: ".red + url + "\n at\n" + pngTemp);
                            console.error(err);
                            return doNext();
                        }

                        trace("Completed Screenshot: " + pngDest);
                        doNext();

                        //trace("Cropping... ".yellow + pngDest);
                        //if(fileExists(pngTemp)) {
                        //    PNGCrop.crop(pngTemp, pngDest, {width: ad.width, height: ad.height}, (err) => {
                        //        if(err) {
                        //            trace("Error cropping: " + pngTemp);
                        //            throw err;
                        //        }
                        //        trace("PNG trimmed -OK-");
                        //        setTimeout(() => G.fs.unlink(pngTemp), 250);
                        //        doNext();
                        //    });
                        //} else {
                        //    trace("Could not trim PNG yet...".red);
                        //    doNext();
                        //}
                    });
                });
            },
            
            (step) => {
				if(isQuick) return step();
				
                tryStepFunc(_this.config.postCompile, step);
            },
            
            (step) => {
                trace("Build Complete!".magenta);
                playSound(ASSETS.SOUNDS.ON_COMPLETE);
                this._sse.sendAll(JSON.stringify({refresh: true}));
            }
        ]);
    }
}

module.exports = {
    stitch: stitch,
    create() { return new stitch(); }
};