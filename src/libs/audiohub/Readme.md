#AudioHub
![Command Line Audio Playback From The Terminal](https://raw.githubusercontent.com/active9/audiohub/master/audiohub.png)

AudioHub is a simple mplayer wrapper written in NodeJS. That provides command line audio playback from the terminal or your NodeJS app.

#INSTALLING
Using Git:
```bash
git clone https://github.com/active9/audiohub
cd audiohub*
npm install
```

Using NPM:
```bash
npm install audiohub
```

#CLI
AudioHub can play many audio formats directly from the command line. Give it a try:
```bash
audiohub path_to_a_music_file.mp3
```

#MODULE
AudioHub may run included as a module in your projects.

```js
var audiohub = require('audiohub');
var path = require('path');

var audio = new audiohub();
audio.play(path.resolve('./track.ogg'));
```

You may also specify a custom player if you don't have mplayer on the system.
In the example below we will playback using vlc instead of mplayer.

```js
var audiohub = require('../lib/audiohub.js');
var path = require('path');

var audio = new audiohub({
	player: 'vlc'
});
audio.play(path.resolve('./track.ogg'));
```

#EXAMPLES
More examples in the [examples](https://github.com/active9/audiohub/tree/master/examples) folder on the github repo.

~Enjoy!

#REQUIREMENTS
- Requires [mplayer](http://www.mplayerhq.hu/design7/news.html) installed and configured within the system environment. (Windows users will need to manually add mplayer to the Environment Variable Path.)

#CONTRIB

AudioHub is open-source via the MIT license we encourage Forking.

#LICENSE
MIT


