global.G = global.G || {};
const process = global.process;
const anymatch = G.anymatch = require('anymatch');
const colors = G.colors = require('colors');
const spawn = require('child_process').spawn;
const async = G.async = require('async');
const path = G.path = require('path');
const pad = G.pad = require('pad');
const fs = G.fs = require('fs');

global.EventEmitter =  require('events');
global.__ = require('lodash');

global.trace = console.log.bind(console);
global.traceProps = function(obj, delim) {
	if(!delim) delim = ', ';
	var results=[];
	for(var prop in obj) {
		results.push(prop);
	}
	trace(results.join(delim));
};

global.traceError = function(msg) {
	trace(msg.red);
	process.exit();
};

global.traceClear = function(cb) {
	process.stdout.write('\033c');
	cb && cb();
};

global.tracePadded = function(header, obj, padding, color, delim) {
	var output = [];
	if(header!=null) output.push(header);
	if(padding==null) padding = 10;
	if(!delim) delim = " = ";
	
	for(var prop in obj) {
		output.push(pad(padding, prop) + delim + obj[prop]);
	}
	
	var outputStr = output.join('\n');
	trace(color!=null ? outputStr[color] : outputStr);
};

global.makeDirs = function(rootpath, names, cb) {
	rootpath = rootpath.mustEndWith("/");
	var count = names.length;
	names.forEach( name => {
		makeDir(rootpath+name, () => {
			if((--count)<=0) cb && cb();
		})
	})
};

global.makeDir = function(fullpath, cb) {
	try {
		fs.accessSync(fullpath, fs.F_OK);
	} catch (e) {
		fs.mkdir( fullpath );
		cb && cb(fullpath);
	}
};

global.isDir = function(path) {
	var stat = fs.statSync(path);
	return stat.isDirectory();
};

global.isDirEmpty = function(fullpath) {
	var files = fs.readdirSync(fullpath);
	return files.length==0;
};

var FILE_ENCODING = {encoding: 'utf8'};

global.fileRead = function(file, cb) {
	if(cb==null) return fs.readFileSync(file, FILE_ENCODING);
	
	fs.readFile(file, FILE_ENCODING, (err, content) => {
		cb(err, content, file);
	});
};

global.fileWrite = function(file, content, cb) {
	if(cb==null) return fs.writeFileSync(file, content, FILE_ENCODING);
	fs.writeFile(file, content, FILE_ENCODING, cb);
};

global.fileExists = function(path){
	try {
		fs.accessSync(path, fs.F_OK);
		return true;
	} catch (e) {
		return false;
	}
};

global.fileDateModified = function(path) {
	return fs.statSync(path).mtime;
};

global.fileFind = function(dir, fileToSearch) {
	if(!fileToSearch) return;
	var found = null, fileToSearchLow = fileToSearch.toLowerCase();

	//var path
	function _readDir(subdir) {
		var files = fs.readdirSync(subdir);

		for(var f=0; f<files.length; f++) {
			if(found) return;

			var file = files[f];
			var fullpath = path.resolve(subdir + '/' + file);
			if(isDir(fullpath)) {
				_readDir(fullpath);
				continue;
			}
			var fileLow = file.toLowerCase();
			if(fileToSearchLow==fileLow) {
				return found = fullpath;
			}
		}
	} _readDir(dir);

	return found;
};

global.checkFilesSum = function(ad, prop, files) {
	if(files.length==0) return false;

	var sum = 0;
	files.forEach(file => {
		sum += (fileDateModified(file).getTime() * 0.001) | 0;
	});

	var propSum = '_{0}FilesSum'.format(prop);
	if(!ad[propSum] || ad[propSum]!=sum) {
		ad[propSum] = sum;
		return true;
	}
	return false;
};

global.fileFilter = function(dir, filterFunc) {
	if(!filterFunc) return;
	var found = [];

	//var path
	function _readDir(subdir) {
		var files = fs.readdirSync(subdir);
		
		files.forEach(file => {
			var fullpath = path.resolve(subdir + '/' + file).fixSlashes();
			
			if(isDir(fullpath)) {
				_readDir(fullpath);
				return;
			}

			if(filterFunc(file, fullpath)) {
				found.push(fullpath);
			}
		});
		
	} _readDir(dir);

	return found;
};

global.fileMerge = function(files, withHeaders) {
	var output = [];
	
	files.forEach( file => {
		if(withHeaders) {
			output.push("/** File merged: " + file + " **/");
		}
		
		output.push( fileRead(file) );
	});
	
	return output.join('\n\n');
};

global.getDirs = function(rootdir) {
	var files = fs.readdirSync(rootdir);
	var dirs = [];
	
	files.forEach(file => {
		var fullpath = path.resolve(rootdir + '/' + file);
		if(isDir(fullpath)) dirs.push(fullpath.fixSlashes());
	});
	
	return dirs;
};

global.asyncDir = (dirs, pattern) => {
	if(typeof(dirs)=='string') dirs = [dirs];

	var requiredFiles = [];
	var matcher = anymatch(pattern);

	function _async() {
		var requiredFuncs = requiredFiles.map((file) => require(file));
		async.series(requiredFuncs);
	}
	
	function _collectFiles() {
		if(dirs.length==0) {
			_async();
			return;
		}

		var dir = dirs.shift();
		fs.readdir(dir, function(err, files) {
			if(err) throw err;
			files = files.filter(matcher).map((file) => dir+'/'+file).sort();

			requiredFiles.push.apply(requiredFiles, files);

			_collectFiles();
		});
	} _collectFiles();
};

global.tryFileContent = function tryFileContent(files, cb) {
	var done=false;
	files.forEach( file => {
		if(done || !fileExists(file)) return;
		
		fileRead(file, cb);
		done = true;
	});
	
	if(done) return;

	cb(new Error("No File Content Found"), null, null);
};

global.mergeRequires = function mergeRequires(files, result) {
	if(!result) result = {};
	var validRequires = files
					.filter((file)=>fileExists(file))
					.map((file)=>require(file));
	return __.merge.apply(__, [result].concat(validRequires));
};

global.replaceBrackets = function(arr, ad) {
	if(__.isString(arr)) arr = [arr];
	
	for(var i=arr.length; --i>=0;) {
		var str = arr[i];

		__.keys(ad).forEach(key => {
			var regex = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
			str = str.replace(regex, ad[key]);
		});

		arr[i] = str;
	}
	
	return arr;
};

global.jsonTry = function(file, defaultContent) {
	if(!fileExists(file)) return defaultContent;
	var jsonStr = fileRead(file);
	return JSON.parse(jsonStr);
};

global.jsonWrite = function(file, content, isPretty) {
	if(isPretty==null) isPretty = "  ";
	fileWrite(file, JSON.stringify(content, null, isPretty));
};

global.imageminBuffer = function( buffer, quality, options ) {
	const imagemin = require('imagemin');
	const imageminPngquant = require('imagemin-pngquant');
	if(!quality) quality = '65-80';

	options = __.merge(options, {
		plugins: [imageminPngquant({quality: quality})]
	});
	
	return imagemin.buffer( buffer, options );
};

global.wrapKeysWith = function(obj, prefix, suffix) {
	if(!prefix) prefix = '';
	if(!suffix) suffix = '';
	
	var recursive = (o) => {
		var ret = {};
		
		for(var prop in o) {
			if(!o.hasOwnProperty(prop)) continue;
			var oValue = o[prop];
			switch(typeof(oValue)) {
				case 'object':
					ret[prop] = recursive(oValue);
					break;
				case 'string':
					ret[prop] = prefix + oValue + suffix;
					break;
				default:
					ret[prop] = oValue;
					break;
			}
		}
		
		return ret;
	};
	
	return recursive(obj);
};

global.remapKeys = function(obj, cb) {
	var result = {};
	__.keys(obj).forEach(key => {
		result[cb(key)] = obj[key];
	});
	
	return result;
};

function noFunc() {}
var _exe = require('child_process').exec;

global.exec = function(command, args, callbacks, doTrace) {

	doTrace && trace(command + ":\n  " + args.join(' '));

	_exe(command + " " + args.join(' '), (err, out, stderr) => {
		if(err) throw err;
		if(out!='') trace(out);
		if(stderr!='') trace(out);

		callbacks && callbacks();
	});
};

global.phpExec = function(file, cb) {
	_exe("php " + file, function (error, stdout, stderr) {
		if(error) return cb("PHP ERROR: " + error);
		if(stderr && stderr.length>0) return cb(stderr);
		cb(stdout);
	});
}

///////////////////////////////////////////////////////
///////////////////////////////////////////////////////
///////////////////////////////////////////////////////

// First, checks if it isn't implemented yet.
if (!"".format) {
	String.prototype.format = function() {
		var args = arguments;
		return this.replace(/{(\d+)}/g, function(match, id) {
			return typeof args[id] != 'undefined' ? args[id] : match;
		});
	};
}

if(!"".fixSlashes) {
	String.prototype.fixSlashes = function() {
		return this.replace(/\\/g, '/');
	};
}

if(!"".endsWith) {
	String.prototype.endsWith = function(suffix) {
		return this.indexOf(suffix, this.length - suffix.length) !== -1;
	};
}

if(!"".mustEndWith) {
	String.prototype.mustEndWith = function(suffix) {
		if(this.endsWith(suffix)) return this;
		return this + suffix;
	};
}

if(!"".contains) {
	String.prototype.contains = function(str) {
		return this.indexOf(str)>-1;
	};
}

global.__project = process.cwd().fixSlashes();
global.__public = __project + '/public';

Array.prototype.has = function(item) {
	return this.indexOf(item)>-1;
}