var audiohub = require('../lib/audiohub.js');
var path = require('path');

var audio = new audiohub();
audio.play(path.resolve('./track.ogg'));