const format = require('util').format;

var SSE = {
	connections: [],
	
	configSSE(app, options){
		var self = this;
		if(!app) throw new Error("Must pass an express 'app' object");

		options = SSE.options = __.assign({
			path: '/sse',
			socketTimeout: 99999,
			interval: 1000
		}, options || {});
				
		app.get('/sse', (req, res) => {
			SSE.connections.push(req);

			SSE.options.verbose && trace(" -- Connecting SSE Client (total %s).", SSE.connections.length);

			req.socket.setTimeout(options.socketTimeout);
			
			//send headers for event-stream connection
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			});

			res.write('\n');

			req.messageID = 0;
			
			if(SSE.options.onNewConnection) {
				SSE.sendMessage(req, SSE.options.onNewConnection(req));
			}
			req.on('close', function() {
				var id = SSE.connections.indexOf(req);
				SSE.connections.splice(id, 1);
				SSE.options.verbose && trace(" -- Disconnecting SSE Client (total %s).", SSE.connections.length);
			});
		});

		SSE.options.autoStart && SSE.startIntervals();
		
		return SSE;
	},
	
	sendMessage(req, message) {
		var formatted = format('id: %s\ndata: %s\n\n', req.messageID++, message);
		req.res.write(formatted); // Note the extra newline
	},

	sendAll(message) {
		SSE.connections.forEach((req) => {
			SSE.sendMessage(req, message);
		});
	},
	
	startIntervals() {
		SSE.trigger();
		setTimeout(SSE.startIntervals, SSE.options.interval);
	},
	
	trigger() {
		if(!SSE.options.callback) return;
		SSE.sendAll(SSE.options.callback());
	}
};

module.exports = SSE;