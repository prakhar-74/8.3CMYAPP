const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200); return res.end('OK'); }
    res.writeHead(200); res.end('Hello 8.3C!');
}).listen(PORT, () => console.log('Listening on', PORT));
