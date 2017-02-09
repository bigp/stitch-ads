"use strict";

/**
 * Created by Chamberlain on 23/08/2016.
 */

const mkdirp = require('mkdirp');
const stitchCls = require("./src/libs/stitch");
const stitch = stitchCls.create();
traceClear();

/*
var DO_IT = false;
(function() {
    if(!DO_IT) return false;
    const path = require('path');
    var data = fileRead(path.resolve(__stitch, './assets/datauri.demo.txt'));

    require('./src/libs/string_utils');
    
    function timeThis(cb) {
        var timeBefore = new Date().getTime();
        cb();
        var timeNow = new Date().getTime();
        trace("It took {0}ms.".format(timeNow-timeBefore));
    }

    timeThis(() => {
        trace(findMostCommonSubstr(data, {
            minCount: 10,
            minLength: 2,
            maxLength: 7
        }));
    });

    timeThis(() => {
        trace(findMostCommonSubstr("aaabbbcccdddaaaddadddbbdbbdbbbdbbdbbb", {
            minCount: 10,
            minLength: 2,
            maxLength: 7
        }));
    });

    timeThis(() => {
        trace(findMostCommonSubstr(data, {
            minCount: 10,
            minLength: 2,
            maxLength: 7
        }));
    });
    

    
    return true;
})();
if(DO_IT) return;
*/


//trace("Stitch Started in: " + __project);

mkdirp(__project + "/public");
mkdirp(__project + "/ads");

stitch.delay = 300;

//Setup the files that can 'trigger' a re-build process:
stitch.watchFolders(__project, __project + "/public");

//Find each ad folders within /ads/ and prepare file-matchers for JS and CSS files.
var adFolder = '**/ads/{{filename}}/';
var comFolder = '**/_common/';
stitch.assembleForEach(__project + "/ads", {
    js: [comFolder+'**/*.js', adFolder+'*.js', adFolder+'*/*.js'],
    css: [comFolder+'**/*.css', adFolder+'*.css', adFolder+'*/*.css']
});