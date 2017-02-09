const mkdirp = require('mkdirp');
const stitchCls = require("./src/libs/stitch");
const stitch = stitchCls.create();
traceClear();

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