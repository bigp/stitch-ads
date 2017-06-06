var spawn = require('child_process').spawn;
var player = null;

function audiohub(opts) {
  var self = this;

  if (!opts) {
    opts = {
      player: 'mplayer'
    }
  }
  this.opts = opts;

  this.player = function(player,file) {
    var playback = spawn(player,[file],{
      detached: false
    });

    // playback.stdout.on('data', function (data) {
      //process.stdout.write(data);
    // });

    // playback.stderr.on('data', function (data) {
      // console.log('Error: ' + data);
    // });

    // playback.on('close', function (code) {
      // console.log('AudioHub Playback Complete');
    // });
  };

  this.play = function(file) {
    //console.log("Now Playing "+ file +" ..");
    self.player(self.opts.player,file);
  };
}

module.exports = audiohub;