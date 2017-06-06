var audiohub = require('../lib/audiohub.js');
var path = require('path');

var audio = new audiohub({
  player: 'vlc'
});
audio.play(path.resolve('./track.ogg'));