const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const ecstatic = require('ecstatic');
const os = require('os');
const probe = require('node-ffprobe');
const favicon = require('serve-favicon');
const fs = require('fs');

const ifaces = os.networkInterfaces();
const app = express();
const directory = process.cwd();
const portNumber = 3000;

let ipAddr;
var file;
var probeData;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// code to get ip address
Object.keys(ifaces).forEach((ifname) => {
  let alias = 0;

  ifaces[ifname].forEach((iface) => {
    if (iface.family !== 'IPv4' || iface.internal !== false) {
      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
      return;
    }

    if (alias >= 1) {
      // this single interface has multiple ipv4 addresses
      console.log(`${ifname}:${alias}`, iface.address);
    } else {
      // this interface has only one ipv4 adress
      console.log('Media server running at', `${iface.address}:${portNumber}`);
      ipAddr = iface.address;
    }
    alias += 1;
  });
});

function serveMedia(req, res) {
  file = directory + req.url;
  probe(file, (err, probeData) => {
    if (err) console.error(err);
    else if (probeData.streams[0].height !== undefined) {
      //give 2 handlers for this request and use next()..use err too maybe<----maybe this
      res.render('videoPlayer',{videoLocation:req.url+'deathNodeStream'});
    }
  });
}
function serveVideoStream(req,res){
  // console.log(req.url);
  fs.stat(file, (onSizeErr, stats) => {
    if (onSizeErr) {
      if (onSizeErr.code === 'ENOENT') {
        // 404 Error if file not found
        return res.sendStatus(404);
      }
      res.end(onSizeErr);
    }
    // console.log(stats);
    // console.log(probeData);
    const range = req.headers.range;
    if (!range) {
      // 416 Wrong range
      return res.sendStatus(416);
    }
    const positions = range.replace(/bytes=/, '').split('-');
    const start = parseInt(positions[0], 10);
    const total = stats.size;
    const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
    const chunksize = (end - start) + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      // 'Content-Type': 'video/mp4',
    });

    const stream = fs.createReadStream(file, { start, end, autoClose: true })
      .on('open', () => {
        stream.pipe(res);
      }).on('error', (streamReadErr) => {
        res.end(streamReadErr);
      });
  });
}

app.get(/deathNodeStream/,serveVideoStream);
app.get(/[.]/, serveMedia);// handle anything with an extension (file)

// static files
app.use(ecstatic({
  root: `${directory}/`,
  showdir: true,
}));

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use((err, req, res) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
