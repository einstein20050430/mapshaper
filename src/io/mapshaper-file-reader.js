/* @requires mapshaper-common */

internal.FileReader = FileReader;

function FileReader(path, opts) {
  var fs = require('fs'),
      fileLen = fs.statSync(path).size,
      DEFAULT_CACHE_LEN = opts && opts.cacheSize || 0x800000, // 8MB
      DEFAULT_BUFFER_LEN = opts && opts.bufferSize || 0x4000, // 32K
      fd, cacheOffs, cache, binArr;

  this.expandBuffer = function() {
    DEFAULT_BUFFER_LEN *= 2;
    return this;
  };

  // Read to BinArray (for compatibility with ShpReader)
  this.readToBinArray = function(readOffs, len) {
    if (updateCache(readOffs, len)) {
      binArr = new BinArray(cache);
    }
    binArr.position(readOffs - cacheOffs);
    return binArr;
  };

  // Read to Buffer
  this.readSync = function(readOffs, len) {
    var bufLen = len || DEFAULT_BUFFER_LEN;
    if (readOffs + bufLen > fileLen) {
      // reduce buffer size if current size exceeds file length
      bufLen = fileLen - readOffs;
    }
    updateCache(readOffs, bufLen);
    return cache.slice(readOffs - cacheOffs, readOffs - cacheOffs + bufLen);
  };

  this.size = function() {
    return fileLen;
  };

  this.close = function() {
    if (fd) {
      fs.closeSync(fd);
      fd = null;
      cache = null;
    }
  };

  // Receive offset and length of byte string that must be read
  // Return true if cache was updated, or false
  function updateCache(fileOffs, bufLen) {
    var headroom = fileLen - fileOffs,
        bytesRead, bytesToRead;
    if (headroom < bufLen || headroom < 0) {
      error("Tried to read past end-of-file");
    }
    if (cache && fileOffs >= cacheOffs && cacheOffs + cache.length >= fileOffs + bufLen) {
      return false;
    }
    bytesToRead = Math.max(DEFAULT_CACHE_LEN, bufLen);
    if (headroom < bytesToRead) {
      bytesToRead = headroom;
    }
    if (!cache || bytesToRead != cache.length) {
      cache = new Buffer(bytesToRead);
    }
    if (!fd) {
      fd = fs.openSync(path, 'r');
    }
    cacheOffs = fileOffs;
    bytesRead = fs.readSync(fd, cache, 0, bytesToRead, fileOffs);
    if (bytesRead != bytesToRead) throw new Error("Error reading file");
    return true;
  }
}

FileReader.prototype.findString = function (str, maxLen) {
  var buf = this.readSync(0, maxLen || 256);
  var strLen = str.length;
  var n = buf.length - strLen;
  var firstByte = str.charCodeAt(0);
  var i;
  for (i=0; i < n; i++) {
    if (buf[i] == firstByte && buf.toString('utf8', i, i + strLen) == str) {
      return {
        offset: i + strLen,
        text: buf.toString('utf8', 0, i)
      };
    }
  }
  return null;
};