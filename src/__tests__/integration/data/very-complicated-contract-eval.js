'use strict';

var sha256$1 = createCommonjsModule(function (module) {
  /**
   * [js-sha256]{@link https://github.com/emn178/js-sha256}
   *
   * @version 0.9.0
   * @author Chen, Yi-Cyuan [emn178@gmail.com]
   * @copyright Chen, Yi-Cyuan 2014-2017
   * @license MIT
   */
  /*jslint bitwise: true */
  (function () {
    var ERROR = 'input is invalid type';
    var WINDOW = typeof window === 'object';
    var root = WINDOW ? window : {};
    if (root.JS_SHA256_NO_WINDOW) {
      WINDOW = false;
    }
    var WEB_WORKER = !WINDOW && typeof self === 'object';
    var NODE_JS =
      !root.JS_SHA256_NO_NODE_JS && typeof browser$1 === 'object' && browser$1.versions && browser$1.versions.node;
    if (NODE_JS) {
      root = commonjsGlobal;
    } else if (WEB_WORKER) {
      root = self;
    }
    var COMMON_JS = !root.JS_SHA256_NO_COMMON_JS && 'object' === 'object' && module.exports;
    var ARRAY_BUFFER = !root.JS_SHA256_NO_ARRAY_BUFFER && typeof ArrayBuffer !== 'undefined';
    var HEX_CHARS = '0123456789abcdef'.split('');
    var EXTRA = [-2147483648, 8388608, 32768, 128];
    var SHIFT = [24, 16, 8, 0];
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
      0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
      0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
      0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
      0xc67178f2
    ];
    var OUTPUT_TYPES = ['hex', 'array', 'digest', 'arrayBuffer'];

    var blocks = [];

    if (root.JS_SHA256_NO_NODE_JS || !Array.isArray) {
      Array.isArray = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
      };
    }

    if (ARRAY_BUFFER && (root.JS_SHA256_NO_ARRAY_BUFFER_IS_VIEW || !ArrayBuffer.isView)) {
      ArrayBuffer.isView = function (obj) {
        return typeof obj === 'object' && obj.buffer && obj.buffer.constructor === ArrayBuffer;
      };
    }

    var createOutputMethod = function (outputType, is224) {
      return function (message) {
        return new Sha256(is224, true).update(message)[outputType]();
      };
    };

    var createMethod = function (is224) {
      var method = createOutputMethod('hex', is224);
      if (NODE_JS) {
        method = nodeWrap(method, is224);
      }
      method.create = function () {
        return new Sha256(is224);
      };
      method.update = function (message) {
        return method.create().update(message);
      };
      for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
        var type = OUTPUT_TYPES[i];
        method[type] = createOutputMethod(type, is224);
      }
      return method;
    };

    var nodeWrap = function (method, is224) {
      var crypto = eval("require('crypto')");
      var Buffer = eval("require('buffer').Buffer");
      var algorithm = is224 ? 'sha224' : 'sha256';
      var nodeMethod = function (message) {
        if (typeof message === 'string') {
          return crypto.createHash(algorithm).update(message, 'utf8').digest('hex');
        } else {
          if (message === null || message === undefined) {
            throw new Error(ERROR);
          } else if (message.constructor === ArrayBuffer) {
            message = new Uint8Array(message);
          }
        }
        if (Array.isArray(message) || ArrayBuffer.isView(message) || message.constructor === Buffer) {
          return crypto.createHash(algorithm).update(new Buffer(message)).digest('hex');
        } else {
          return method(message);
        }
      };
      return nodeMethod;
    };

    var createHmacOutputMethod = function (outputType, is224) {
      return function (key, message) {
        return new HmacSha256(key, is224, true).update(message)[outputType]();
      };
    };

    var createHmacMethod = function (is224) {
      var method = createHmacOutputMethod('hex', is224);
      method.create = function (key) {
        return new HmacSha256(key, is224);
      };
      method.update = function (key, message) {
        return method.create(key).update(message);
      };
      for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
        var type = OUTPUT_TYPES[i];
        method[type] = createHmacOutputMethod(type, is224);
      }
      return method;
    };

    function Sha256(is224, sharedMemory) {
      if (sharedMemory) {
        blocks[0] =
          blocks[16] =
          blocks[1] =
          blocks[2] =
          blocks[3] =
          blocks[4] =
          blocks[5] =
          blocks[6] =
          blocks[7] =
          blocks[8] =
          blocks[9] =
          blocks[10] =
          blocks[11] =
          blocks[12] =
          blocks[13] =
          blocks[14] =
          blocks[15] =
            0;
        this.blocks = blocks;
      } else {
        this.blocks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }

      if (is224) {
        this.h0 = 0xc1059ed8;
        this.h1 = 0x367cd507;
        this.h2 = 0x3070dd17;
        this.h3 = 0xf70e5939;
        this.h4 = 0xffc00b31;
        this.h5 = 0x68581511;
        this.h6 = 0x64f98fa7;
        this.h7 = 0xbefa4fa4;
      } else {
        // 256
        this.h0 = 0x6a09e667;
        this.h1 = 0xbb67ae85;
        this.h2 = 0x3c6ef372;
        this.h3 = 0xa54ff53a;
        this.h4 = 0x510e527f;
        this.h5 = 0x9b05688c;
        this.h6 = 0x1f83d9ab;
        this.h7 = 0x5be0cd19;
      }

      this.block = this.start = this.bytes = this.hBytes = 0;
      this.finalized = this.hashed = false;
      this.first = true;
      this.is224 = is224;
    }

    Sha256.prototype.update = function (message) {
      if (this.finalized) {
        return;
      }
      var notString,
        type = typeof message;
      if (type !== 'string') {
        if (type === 'object') {
          if (message === null) {
            throw new Error(ERROR);
          } else if (ARRAY_BUFFER && message.constructor === ArrayBuffer) {
            message = new Uint8Array(message);
          } else if (!Array.isArray(message)) {
            if (!ARRAY_BUFFER || !ArrayBuffer.isView(message)) {
              throw new Error(ERROR);
            }
          }
        } else {
          throw new Error(ERROR);
        }
        notString = true;
      }
      var code,
        index = 0,
        i,
        length = message.length,
        blocks = this.blocks;

      while (index < length) {
        if (this.hashed) {
          this.hashed = false;
          blocks[0] = this.block;
          blocks[16] =
            blocks[1] =
            blocks[2] =
            blocks[3] =
            blocks[4] =
            blocks[5] =
            blocks[6] =
            blocks[7] =
            blocks[8] =
            blocks[9] =
            blocks[10] =
            blocks[11] =
            blocks[12] =
            blocks[13] =
            blocks[14] =
            blocks[15] =
              0;
        }

        if (notString) {
          for (i = this.start; index < length && i < 64; ++index) {
            blocks[i >> 2] |= message[index] << SHIFT[i++ & 3];
          }
        } else {
          for (i = this.start; index < length && i < 64; ++index) {
            code = message.charCodeAt(index);
            if (code < 0x80) {
              blocks[i >> 2] |= code << SHIFT[i++ & 3];
            } else if (code < 0x800) {
              blocks[i >> 2] |= (0xc0 | (code >> 6)) << SHIFT[i++ & 3];
              blocks[i >> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
            } else if (code < 0xd800 || code >= 0xe000) {
              blocks[i >> 2] |= (0xe0 | (code >> 12)) << SHIFT[i++ & 3];
              blocks[i >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << SHIFT[i++ & 3];
              blocks[i >> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
            } else {
              code = 0x10000 + (((code & 0x3ff) << 10) | (message.charCodeAt(++index) & 0x3ff));
              blocks[i >> 2] |= (0xf0 | (code >> 18)) << SHIFT[i++ & 3];
              blocks[i >> 2] |= (0x80 | ((code >> 12) & 0x3f)) << SHIFT[i++ & 3];
              blocks[i >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << SHIFT[i++ & 3];
              blocks[i >> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
            }
          }
        }

        this.lastByteIndex = i;
        this.bytes += i - this.start;
        if (i >= 64) {
          this.block = blocks[16];
          this.start = i - 64;
          this.hash();
          this.hashed = true;
        } else {
          this.start = i;
        }
      }
      if (this.bytes > 4294967295) {
        this.hBytes += (this.bytes / 4294967296) << 0;
        this.bytes = this.bytes % 4294967296;
      }
      return this;
    };

    Sha256.prototype.finalize = function () {
      if (this.finalized) {
        return;
      }
      this.finalized = true;
      var blocks = this.blocks,
        i = this.lastByteIndex;
      blocks[16] = this.block;
      blocks[i >> 2] |= EXTRA[i & 3];
      this.block = blocks[16];
      if (i >= 56) {
        if (!this.hashed) {
          this.hash();
        }
        blocks[0] = this.block;
        blocks[16] =
          blocks[1] =
          blocks[2] =
          blocks[3] =
          blocks[4] =
          blocks[5] =
          blocks[6] =
          blocks[7] =
          blocks[8] =
          blocks[9] =
          blocks[10] =
          blocks[11] =
          blocks[12] =
          blocks[13] =
          blocks[14] =
          blocks[15] =
            0;
      }
      blocks[14] = (this.hBytes << 3) | (this.bytes >>> 29);
      blocks[15] = this.bytes << 3;
      this.hash();
    };

    Sha256.prototype.hash = function () {
      var a = this.h0,
        b = this.h1,
        c = this.h2,
        d = this.h3,
        e = this.h4,
        f = this.h5,
        g = this.h6,
        h = this.h7,
        blocks = this.blocks,
        j,
        s0,
        s1,
        maj,
        t1,
        t2,
        ch,
        ab,
        da,
        cd,
        bc;

      for (j = 16; j < 64; ++j) {
        // rightrotate
        t1 = blocks[j - 15];
        s0 = ((t1 >>> 7) | (t1 << 25)) ^ ((t1 >>> 18) | (t1 << 14)) ^ (t1 >>> 3);
        t1 = blocks[j - 2];
        s1 = ((t1 >>> 17) | (t1 << 15)) ^ ((t1 >>> 19) | (t1 << 13)) ^ (t1 >>> 10);
        blocks[j] = (blocks[j - 16] + s0 + blocks[j - 7] + s1) << 0;
      }

      bc = b & c;
      for (j = 0; j < 64; j += 4) {
        if (this.first) {
          if (this.is224) {
            ab = 300032;
            t1 = blocks[0] - 1413257819;
            h = (t1 - 150054599) << 0;
            d = (t1 + 24177077) << 0;
          } else {
            ab = 704751109;
            t1 = blocks[0] - 210244248;
            h = (t1 - 1521486534) << 0;
            d = (t1 + 143694565) << 0;
          }
          this.first = false;
        } else {
          s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
          s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
          ab = a & b;
          maj = ab ^ (a & c) ^ bc;
          ch = (e & f) ^ (~e & g);
          t1 = h + s1 + ch + K[j] + blocks[j];
          t2 = s0 + maj;
          h = (d + t1) << 0;
          d = (t1 + t2) << 0;
        }
        s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
        s1 = ((h >>> 6) | (h << 26)) ^ ((h >>> 11) | (h << 21)) ^ ((h >>> 25) | (h << 7));
        da = d & a;
        maj = da ^ (d & b) ^ ab;
        ch = (h & e) ^ (~h & f);
        t1 = g + s1 + ch + K[j + 1] + blocks[j + 1];
        t2 = s0 + maj;
        g = (c + t1) << 0;
        c = (t1 + t2) << 0;
        s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
        s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
        cd = c & d;
        maj = cd ^ (c & a) ^ da;
        ch = (g & h) ^ (~g & e);
        t1 = f + s1 + ch + K[j + 2] + blocks[j + 2];
        t2 = s0 + maj;
        f = (b + t1) << 0;
        b = (t1 + t2) << 0;
        s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
        s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
        bc = b & c;
        maj = bc ^ (b & d) ^ cd;
        ch = (f & g) ^ (~f & h);
        t1 = e + s1 + ch + K[j + 3] + blocks[j + 3];
        t2 = s0 + maj;
        e = (a + t1) << 0;
        a = (t1 + t2) << 0;
      }

      this.h0 = (this.h0 + a) << 0;
      this.h1 = (this.h1 + b) << 0;
      this.h2 = (this.h2 + c) << 0;
      this.h3 = (this.h3 + d) << 0;
      this.h4 = (this.h4 + e) << 0;
      this.h5 = (this.h5 + f) << 0;
      this.h6 = (this.h6 + g) << 0;
      this.h7 = (this.h7 + h) << 0;
    };

    Sha256.prototype.hex = function () {
      this.finalize();

      var h0 = this.h0,
        h1 = this.h1,
        h2 = this.h2,
        h3 = this.h3,
        h4 = this.h4,
        h5 = this.h5,
        h6 = this.h6,
        h7 = this.h7;

      var hex =
        HEX_CHARS[(h0 >> 28) & 0x0f] +
        HEX_CHARS[(h0 >> 24) & 0x0f] +
        HEX_CHARS[(h0 >> 20) & 0x0f] +
        HEX_CHARS[(h0 >> 16) & 0x0f] +
        HEX_CHARS[(h0 >> 12) & 0x0f] +
        HEX_CHARS[(h0 >> 8) & 0x0f] +
        HEX_CHARS[(h0 >> 4) & 0x0f] +
        HEX_CHARS[h0 & 0x0f] +
        HEX_CHARS[(h1 >> 28) & 0x0f] +
        HEX_CHARS[(h1 >> 24) & 0x0f] +
        HEX_CHARS[(h1 >> 20) & 0x0f] +
        HEX_CHARS[(h1 >> 16) & 0x0f] +
        HEX_CHARS[(h1 >> 12) & 0x0f] +
        HEX_CHARS[(h1 >> 8) & 0x0f] +
        HEX_CHARS[(h1 >> 4) & 0x0f] +
        HEX_CHARS[h1 & 0x0f] +
        HEX_CHARS[(h2 >> 28) & 0x0f] +
        HEX_CHARS[(h2 >> 24) & 0x0f] +
        HEX_CHARS[(h2 >> 20) & 0x0f] +
        HEX_CHARS[(h2 >> 16) & 0x0f] +
        HEX_CHARS[(h2 >> 12) & 0x0f] +
        HEX_CHARS[(h2 >> 8) & 0x0f] +
        HEX_CHARS[(h2 >> 4) & 0x0f] +
        HEX_CHARS[h2 & 0x0f] +
        HEX_CHARS[(h3 >> 28) & 0x0f] +
        HEX_CHARS[(h3 >> 24) & 0x0f] +
        HEX_CHARS[(h3 >> 20) & 0x0f] +
        HEX_CHARS[(h3 >> 16) & 0x0f] +
        HEX_CHARS[(h3 >> 12) & 0x0f] +
        HEX_CHARS[(h3 >> 8) & 0x0f] +
        HEX_CHARS[(h3 >> 4) & 0x0f] +
        HEX_CHARS[h3 & 0x0f] +
        HEX_CHARS[(h4 >> 28) & 0x0f] +
        HEX_CHARS[(h4 >> 24) & 0x0f] +
        HEX_CHARS[(h4 >> 20) & 0x0f] +
        HEX_CHARS[(h4 >> 16) & 0x0f] +
        HEX_CHARS[(h4 >> 12) & 0x0f] +
        HEX_CHARS[(h4 >> 8) & 0x0f] +
        HEX_CHARS[(h4 >> 4) & 0x0f] +
        HEX_CHARS[h4 & 0x0f] +
        HEX_CHARS[(h5 >> 28) & 0x0f] +
        HEX_CHARS[(h5 >> 24) & 0x0f] +
        HEX_CHARS[(h5 >> 20) & 0x0f] +
        HEX_CHARS[(h5 >> 16) & 0x0f] +
        HEX_CHARS[(h5 >> 12) & 0x0f] +
        HEX_CHARS[(h5 >> 8) & 0x0f] +
        HEX_CHARS[(h5 >> 4) & 0x0f] +
        HEX_CHARS[h5 & 0x0f] +
        HEX_CHARS[(h6 >> 28) & 0x0f] +
        HEX_CHARS[(h6 >> 24) & 0x0f] +
        HEX_CHARS[(h6 >> 20) & 0x0f] +
        HEX_CHARS[(h6 >> 16) & 0x0f] +
        HEX_CHARS[(h6 >> 12) & 0x0f] +
        HEX_CHARS[(h6 >> 8) & 0x0f] +
        HEX_CHARS[(h6 >> 4) & 0x0f] +
        HEX_CHARS[h6 & 0x0f];
      if (!this.is224) {
        hex +=
          HEX_CHARS[(h7 >> 28) & 0x0f] +
          HEX_CHARS[(h7 >> 24) & 0x0f] +
          HEX_CHARS[(h7 >> 20) & 0x0f] +
          HEX_CHARS[(h7 >> 16) & 0x0f] +
          HEX_CHARS[(h7 >> 12) & 0x0f] +
          HEX_CHARS[(h7 >> 8) & 0x0f] +
          HEX_CHARS[(h7 >> 4) & 0x0f] +
          HEX_CHARS[h7 & 0x0f];
      }
      return hex;
    };

    Sha256.prototype.toString = Sha256.prototype.hex;

    Sha256.prototype.digest = function () {
      this.finalize();

      var h0 = this.h0,
        h1 = this.h1,
        h2 = this.h2,
        h3 = this.h3,
        h4 = this.h4,
        h5 = this.h5,
        h6 = this.h6,
        h7 = this.h7;

      var arr = [
        (h0 >> 24) & 0xff,
        (h0 >> 16) & 0xff,
        (h0 >> 8) & 0xff,
        h0 & 0xff,
        (h1 >> 24) & 0xff,
        (h1 >> 16) & 0xff,
        (h1 >> 8) & 0xff,
        h1 & 0xff,
        (h2 >> 24) & 0xff,
        (h2 >> 16) & 0xff,
        (h2 >> 8) & 0xff,
        h2 & 0xff,
        (h3 >> 24) & 0xff,
        (h3 >> 16) & 0xff,
        (h3 >> 8) & 0xff,
        h3 & 0xff,
        (h4 >> 24) & 0xff,
        (h4 >> 16) & 0xff,
        (h4 >> 8) & 0xff,
        h4 & 0xff,
        (h5 >> 24) & 0xff,
        (h5 >> 16) & 0xff,
        (h5 >> 8) & 0xff,
        h5 & 0xff,
        (h6 >> 24) & 0xff,
        (h6 >> 16) & 0xff,
        (h6 >> 8) & 0xff,
        h6 & 0xff
      ];
      if (!this.is224) {
        arr.push((h7 >> 24) & 0xff, (h7 >> 16) & 0xff, (h7 >> 8) & 0xff, h7 & 0xff);
      }
      return arr;
    };

    Sha256.prototype.array = Sha256.prototype.digest;

    Sha256.prototype.arrayBuffer = function () {
      this.finalize();

      var buffer = new ArrayBuffer(this.is224 ? 28 : 32);
      var dataView = new DataView(buffer);
      dataView.setUint32(0, this.h0);
      dataView.setUint32(4, this.h1);
      dataView.setUint32(8, this.h2);
      dataView.setUint32(12, this.h3);
      dataView.setUint32(16, this.h4);
      dataView.setUint32(20, this.h5);
      dataView.setUint32(24, this.h6);
      if (!this.is224) {
        dataView.setUint32(28, this.h7);
      }
      return buffer;
    };

    function HmacSha256(key, is224, sharedMemory) {
      var i,
        type = typeof key;
      if (type === 'string') {
        var bytes = [],
          length = key.length,
          index = 0,
          code;
        for (i = 0; i < length; ++i) {
          code = key.charCodeAt(i);
          if (code < 0x80) {
            bytes[index++] = code;
          } else if (code < 0x800) {
            bytes[index++] = 0xc0 | (code >> 6);
            bytes[index++] = 0x80 | (code & 0x3f);
          } else if (code < 0xd800 || code >= 0xe000) {
            bytes[index++] = 0xe0 | (code >> 12);
            bytes[index++] = 0x80 | ((code >> 6) & 0x3f);
            bytes[index++] = 0x80 | (code & 0x3f);
          } else {
            code = 0x10000 + (((code & 0x3ff) << 10) | (key.charCodeAt(++i) & 0x3ff));
            bytes[index++] = 0xf0 | (code >> 18);
            bytes[index++] = 0x80 | ((code >> 12) & 0x3f);
            bytes[index++] = 0x80 | ((code >> 6) & 0x3f);
            bytes[index++] = 0x80 | (code & 0x3f);
          }
        }
        key = bytes;
      } else {
        if (type === 'object') {
          if (key === null) {
            throw new Error(ERROR);
          } else if (ARRAY_BUFFER && key.constructor === ArrayBuffer) {
            key = new Uint8Array(key);
          } else if (!Array.isArray(key)) {
            if (!ARRAY_BUFFER || !ArrayBuffer.isView(key)) {
              throw new Error(ERROR);
            }
          }
        } else {
          throw new Error(ERROR);
        }
      }

      if (key.length > 64) {
        key = new Sha256(is224, true).update(key).array();
      }

      var oKeyPad = [],
        iKeyPad = [];
      for (i = 0; i < 64; ++i) {
        var b = key[i] || 0;
        oKeyPad[i] = 0x5c ^ b;
        iKeyPad[i] = 0x36 ^ b;
      }

      Sha256.call(this, is224, sharedMemory);

      this.update(iKeyPad);
      this.oKeyPad = oKeyPad;
      this.inner = true;
      this.sharedMemory = sharedMemory;
    }
    HmacSha256.prototype = new Sha256();

    HmacSha256.prototype.finalize = function () {
      Sha256.prototype.finalize.call(this);
      if (this.inner) {
        this.inner = false;
        var innerHash = this.array();
        Sha256.call(this, this.is224, this.sharedMemory);
        this.update(this.oKeyPad);
        this.update(innerHash);
        Sha256.prototype.finalize.call(this);
      }
    };

    var exports = createMethod();
    exports.sha256 = exports;
    exports.sha224 = createMethod(true);
    exports.sha256.hmac = createHmacMethod();
    exports.sha224.hmac = createHmacMethod(true);

    if (COMMON_JS) {
      module.exports = exports;
    } else {
      root.sha256 = exports.sha256;
      root.sha224 = exports.sha224;
    }
  })();
});

var padString_1 = createCommonjsModule(function (module, exports) {
  Object.defineProperty(exports, '__esModule', { value: true });

  function padString(input) {
    var segmentLength = 4;
    var stringLength = input.length;
    var diff = stringLength % segmentLength;
    if (!diff) {
      return input;
    }
    var position = stringLength;
    var padLength = segmentLength - diff;
    var paddedStringLength = stringLength + padLength;
    var buffer$1 = buffer.Buffer.alloc(paddedStringLength);
    buffer$1.write(input);
    while (padLength--) {
      buffer$1.write('=', position++);
    }
    return buffer$1.toString();
  }
  exports.default = padString;
});

/*@__PURE__*/ unwrapExports(padString_1);

var base64url_1 = createCommonjsModule(function (module, exports) {
  Object.defineProperty(exports, '__esModule', { value: true });

  function encode(input, encoding) {
    if (encoding === void 0) {
      encoding = 'utf8';
    }
    if (buffer.Buffer.isBuffer(input)) {
      return fromBase64(input.toString('base64'));
    }
    return fromBase64(buffer.Buffer.from(input, encoding).toString('base64'));
  }
  function decode(base64url, encoding) {
    if (encoding === void 0) {
      encoding = 'utf8';
    }
    return buffer.Buffer.from(toBase64(base64url), 'base64').toString(encoding);
  }
  function toBase64(base64url) {
    base64url = base64url.toString();
    return padString_1.default(base64url).replace(/\-/g, '+').replace(/_/g, '/');
  }
  function fromBase64(base64) {
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function toBuffer(base64url) {
    return buffer.Buffer.from(toBase64(base64url), 'base64');
  }
  var base64url = encode;
  base64url.encode = encode;
  base64url.decode = decode;
  base64url.toBase64 = toBase64;
  base64url.fromBase64 = fromBase64;
  base64url.toBuffer = toBuffer;
  exports.default = base64url;
});

/*@__PURE__*/ unwrapExports(base64url_1);

var uportBase64url = createCommonjsModule(function (module) {
  module.exports = base64url_1.default;
  module.exports.default = module.exports;
});

var naclFast = createCommonjsModule(function (module) {
  (function (nacl) {
    // Ported in 2014 by Dmitry Chestnykh and Devi Mandiri.
    // Public domain.
    //
    // Implementation derived from TweetNaCl version 20140427.
    // See for details: http://tweetnacl.cr.yp.to/

    var gf = function (init) {
      var i,
        r = new Float64Array(16);
      if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
      return r;
    };

    //  Pluggable, initialized in high-level API below.
    var randombytes = function (/* x, n */) {
      throw new Error('no PRNG');
    };

    var _0 = new Uint8Array(16);
    var _9 = new Uint8Array(32);
    _9[0] = 9;

    var gf0 = gf(),
      gf1 = gf([1]),
      _121665 = gf([0xdb41, 1]),
      D = gf([
        0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070, 0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f,
        0x6cee, 0x5203
      ]),
      D2 = gf([
        0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0, 0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df,
        0xd9dc, 0x2406
      ]),
      X = gf([
        0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c, 0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e,
        0x36d3, 0x2169
      ]),
      Y = gf([
        0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
        0x6666, 0x6666
      ]),
      I = gf([
        0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43, 0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1,
        0x2480, 0x2b83
      ]);

    function ts64(x, i, h, l) {
      x[i] = (h >> 24) & 0xff;
      x[i + 1] = (h >> 16) & 0xff;
      x[i + 2] = (h >> 8) & 0xff;
      x[i + 3] = h & 0xff;
      x[i + 4] = (l >> 24) & 0xff;
      x[i + 5] = (l >> 16) & 0xff;
      x[i + 6] = (l >> 8) & 0xff;
      x[i + 7] = l & 0xff;
    }

    function vn(x, xi, y, yi, n) {
      var i,
        d = 0;
      for (i = 0; i < n; i++) d |= x[xi + i] ^ y[yi + i];
      return (1 & ((d - 1) >>> 8)) - 1;
    }

    function crypto_verify_16(x, xi, y, yi) {
      return vn(x, xi, y, yi, 16);
    }

    function crypto_verify_32(x, xi, y, yi) {
      return vn(x, xi, y, yi, 32);
    }

    function core_salsa20(o, p, k, c) {
      var j0 = (c[0] & 0xff) | ((c[1] & 0xff) << 8) | ((c[2] & 0xff) << 16) | ((c[3] & 0xff) << 24),
        j1 = (k[0] & 0xff) | ((k[1] & 0xff) << 8) | ((k[2] & 0xff) << 16) | ((k[3] & 0xff) << 24),
        j2 = (k[4] & 0xff) | ((k[5] & 0xff) << 8) | ((k[6] & 0xff) << 16) | ((k[7] & 0xff) << 24),
        j3 = (k[8] & 0xff) | ((k[9] & 0xff) << 8) | ((k[10] & 0xff) << 16) | ((k[11] & 0xff) << 24),
        j4 = (k[12] & 0xff) | ((k[13] & 0xff) << 8) | ((k[14] & 0xff) << 16) | ((k[15] & 0xff) << 24),
        j5 = (c[4] & 0xff) | ((c[5] & 0xff) << 8) | ((c[6] & 0xff) << 16) | ((c[7] & 0xff) << 24),
        j6 = (p[0] & 0xff) | ((p[1] & 0xff) << 8) | ((p[2] & 0xff) << 16) | ((p[3] & 0xff) << 24),
        j7 = (p[4] & 0xff) | ((p[5] & 0xff) << 8) | ((p[6] & 0xff) << 16) | ((p[7] & 0xff) << 24),
        j8 = (p[8] & 0xff) | ((p[9] & 0xff) << 8) | ((p[10] & 0xff) << 16) | ((p[11] & 0xff) << 24),
        j9 = (p[12] & 0xff) | ((p[13] & 0xff) << 8) | ((p[14] & 0xff) << 16) | ((p[15] & 0xff) << 24),
        j10 = (c[8] & 0xff) | ((c[9] & 0xff) << 8) | ((c[10] & 0xff) << 16) | ((c[11] & 0xff) << 24),
        j11 = (k[16] & 0xff) | ((k[17] & 0xff) << 8) | ((k[18] & 0xff) << 16) | ((k[19] & 0xff) << 24),
        j12 = (k[20] & 0xff) | ((k[21] & 0xff) << 8) | ((k[22] & 0xff) << 16) | ((k[23] & 0xff) << 24),
        j13 = (k[24] & 0xff) | ((k[25] & 0xff) << 8) | ((k[26] & 0xff) << 16) | ((k[27] & 0xff) << 24),
        j14 = (k[28] & 0xff) | ((k[29] & 0xff) << 8) | ((k[30] & 0xff) << 16) | ((k[31] & 0xff) << 24),
        j15 = (c[12] & 0xff) | ((c[13] & 0xff) << 8) | ((c[14] & 0xff) << 16) | ((c[15] & 0xff) << 24);

      var x0 = j0,
        x1 = j1,
        x2 = j2,
        x3 = j3,
        x4 = j4,
        x5 = j5,
        x6 = j6,
        x7 = j7,
        x8 = j8,
        x9 = j9,
        x10 = j10,
        x11 = j11,
        x12 = j12,
        x13 = j13,
        x14 = j14,
        x15 = j15,
        u;

      for (var i = 0; i < 20; i += 2) {
        u = (x0 + x12) | 0;
        x4 ^= (u << 7) | (u >>> (32 - 7));
        u = (x4 + x0) | 0;
        x8 ^= (u << 9) | (u >>> (32 - 9));
        u = (x8 + x4) | 0;
        x12 ^= (u << 13) | (u >>> (32 - 13));
        u = (x12 + x8) | 0;
        x0 ^= (u << 18) | (u >>> (32 - 18));

        u = (x5 + x1) | 0;
        x9 ^= (u << 7) | (u >>> (32 - 7));
        u = (x9 + x5) | 0;
        x13 ^= (u << 9) | (u >>> (32 - 9));
        u = (x13 + x9) | 0;
        x1 ^= (u << 13) | (u >>> (32 - 13));
        u = (x1 + x13) | 0;
        x5 ^= (u << 18) | (u >>> (32 - 18));

        u = (x10 + x6) | 0;
        x14 ^= (u << 7) | (u >>> (32 - 7));
        u = (x14 + x10) | 0;
        x2 ^= (u << 9) | (u >>> (32 - 9));
        u = (x2 + x14) | 0;
        x6 ^= (u << 13) | (u >>> (32 - 13));
        u = (x6 + x2) | 0;
        x10 ^= (u << 18) | (u >>> (32 - 18));

        u = (x15 + x11) | 0;
        x3 ^= (u << 7) | (u >>> (32 - 7));
        u = (x3 + x15) | 0;
        x7 ^= (u << 9) | (u >>> (32 - 9));
        u = (x7 + x3) | 0;
        x11 ^= (u << 13) | (u >>> (32 - 13));
        u = (x11 + x7) | 0;
        x15 ^= (u << 18) | (u >>> (32 - 18));

        u = (x0 + x3) | 0;
        x1 ^= (u << 7) | (u >>> (32 - 7));
        u = (x1 + x0) | 0;
        x2 ^= (u << 9) | (u >>> (32 - 9));
        u = (x2 + x1) | 0;
        x3 ^= (u << 13) | (u >>> (32 - 13));
        u = (x3 + x2) | 0;
        x0 ^= (u << 18) | (u >>> (32 - 18));

        u = (x5 + x4) | 0;
        x6 ^= (u << 7) | (u >>> (32 - 7));
        u = (x6 + x5) | 0;
        x7 ^= (u << 9) | (u >>> (32 - 9));
        u = (x7 + x6) | 0;
        x4 ^= (u << 13) | (u >>> (32 - 13));
        u = (x4 + x7) | 0;
        x5 ^= (u << 18) | (u >>> (32 - 18));

        u = (x10 + x9) | 0;
        x11 ^= (u << 7) | (u >>> (32 - 7));
        u = (x11 + x10) | 0;
        x8 ^= (u << 9) | (u >>> (32 - 9));
        u = (x8 + x11) | 0;
        x9 ^= (u << 13) | (u >>> (32 - 13));
        u = (x9 + x8) | 0;
        x10 ^= (u << 18) | (u >>> (32 - 18));

        u = (x15 + x14) | 0;
        x12 ^= (u << 7) | (u >>> (32 - 7));
        u = (x12 + x15) | 0;
        x13 ^= (u << 9) | (u >>> (32 - 9));
        u = (x13 + x12) | 0;
        x14 ^= (u << 13) | (u >>> (32 - 13));
        u = (x14 + x13) | 0;
        x15 ^= (u << 18) | (u >>> (32 - 18));
      }
      x0 = (x0 + j0) | 0;
      x1 = (x1 + j1) | 0;
      x2 = (x2 + j2) | 0;
      x3 = (x3 + j3) | 0;
      x4 = (x4 + j4) | 0;
      x5 = (x5 + j5) | 0;
      x6 = (x6 + j6) | 0;
      x7 = (x7 + j7) | 0;
      x8 = (x8 + j8) | 0;
      x9 = (x9 + j9) | 0;
      x10 = (x10 + j10) | 0;
      x11 = (x11 + j11) | 0;
      x12 = (x12 + j12) | 0;
      x13 = (x13 + j13) | 0;
      x14 = (x14 + j14) | 0;
      x15 = (x15 + j15) | 0;

      o[0] = (x0 >>> 0) & 0xff;
      o[1] = (x0 >>> 8) & 0xff;
      o[2] = (x0 >>> 16) & 0xff;
      o[3] = (x0 >>> 24) & 0xff;

      o[4] = (x1 >>> 0) & 0xff;
      o[5] = (x1 >>> 8) & 0xff;
      o[6] = (x1 >>> 16) & 0xff;
      o[7] = (x1 >>> 24) & 0xff;

      o[8] = (x2 >>> 0) & 0xff;
      o[9] = (x2 >>> 8) & 0xff;
      o[10] = (x2 >>> 16) & 0xff;
      o[11] = (x2 >>> 24) & 0xff;

      o[12] = (x3 >>> 0) & 0xff;
      o[13] = (x3 >>> 8) & 0xff;
      o[14] = (x3 >>> 16) & 0xff;
      o[15] = (x3 >>> 24) & 0xff;

      o[16] = (x4 >>> 0) & 0xff;
      o[17] = (x4 >>> 8) & 0xff;
      o[18] = (x4 >>> 16) & 0xff;
      o[19] = (x4 >>> 24) & 0xff;

      o[20] = (x5 >>> 0) & 0xff;
      o[21] = (x5 >>> 8) & 0xff;
      o[22] = (x5 >>> 16) & 0xff;
      o[23] = (x5 >>> 24) & 0xff;

      o[24] = (x6 >>> 0) & 0xff;
      o[25] = (x6 >>> 8) & 0xff;
      o[26] = (x6 >>> 16) & 0xff;
      o[27] = (x6 >>> 24) & 0xff;

      o[28] = (x7 >>> 0) & 0xff;
      o[29] = (x7 >>> 8) & 0xff;
      o[30] = (x7 >>> 16) & 0xff;
      o[31] = (x7 >>> 24) & 0xff;

      o[32] = (x8 >>> 0) & 0xff;
      o[33] = (x8 >>> 8) & 0xff;
      o[34] = (x8 >>> 16) & 0xff;
      o[35] = (x8 >>> 24) & 0xff;

      o[36] = (x9 >>> 0) & 0xff;
      o[37] = (x9 >>> 8) & 0xff;
      o[38] = (x9 >>> 16) & 0xff;
      o[39] = (x9 >>> 24) & 0xff;

      o[40] = (x10 >>> 0) & 0xff;
      o[41] = (x10 >>> 8) & 0xff;
      o[42] = (x10 >>> 16) & 0xff;
      o[43] = (x10 >>> 24) & 0xff;

      o[44] = (x11 >>> 0) & 0xff;
      o[45] = (x11 >>> 8) & 0xff;
      o[46] = (x11 >>> 16) & 0xff;
      o[47] = (x11 >>> 24) & 0xff;

      o[48] = (x12 >>> 0) & 0xff;
      o[49] = (x12 >>> 8) & 0xff;
      o[50] = (x12 >>> 16) & 0xff;
      o[51] = (x12 >>> 24) & 0xff;

      o[52] = (x13 >>> 0) & 0xff;
      o[53] = (x13 >>> 8) & 0xff;
      o[54] = (x13 >>> 16) & 0xff;
      o[55] = (x13 >>> 24) & 0xff;

      o[56] = (x14 >>> 0) & 0xff;
      o[57] = (x14 >>> 8) & 0xff;
      o[58] = (x14 >>> 16) & 0xff;
      o[59] = (x14 >>> 24) & 0xff;

      o[60] = (x15 >>> 0) & 0xff;
      o[61] = (x15 >>> 8) & 0xff;
      o[62] = (x15 >>> 16) & 0xff;
      o[63] = (x15 >>> 24) & 0xff;
    }

    function core_hsalsa20(o, p, k, c) {
      var j0 = (c[0] & 0xff) | ((c[1] & 0xff) << 8) | ((c[2] & 0xff) << 16) | ((c[3] & 0xff) << 24),
        j1 = (k[0] & 0xff) | ((k[1] & 0xff) << 8) | ((k[2] & 0xff) << 16) | ((k[3] & 0xff) << 24),
        j2 = (k[4] & 0xff) | ((k[5] & 0xff) << 8) | ((k[6] & 0xff) << 16) | ((k[7] & 0xff) << 24),
        j3 = (k[8] & 0xff) | ((k[9] & 0xff) << 8) | ((k[10] & 0xff) << 16) | ((k[11] & 0xff) << 24),
        j4 = (k[12] & 0xff) | ((k[13] & 0xff) << 8) | ((k[14] & 0xff) << 16) | ((k[15] & 0xff) << 24),
        j5 = (c[4] & 0xff) | ((c[5] & 0xff) << 8) | ((c[6] & 0xff) << 16) | ((c[7] & 0xff) << 24),
        j6 = (p[0] & 0xff) | ((p[1] & 0xff) << 8) | ((p[2] & 0xff) << 16) | ((p[3] & 0xff) << 24),
        j7 = (p[4] & 0xff) | ((p[5] & 0xff) << 8) | ((p[6] & 0xff) << 16) | ((p[7] & 0xff) << 24),
        j8 = (p[8] & 0xff) | ((p[9] & 0xff) << 8) | ((p[10] & 0xff) << 16) | ((p[11] & 0xff) << 24),
        j9 = (p[12] & 0xff) | ((p[13] & 0xff) << 8) | ((p[14] & 0xff) << 16) | ((p[15] & 0xff) << 24),
        j10 = (c[8] & 0xff) | ((c[9] & 0xff) << 8) | ((c[10] & 0xff) << 16) | ((c[11] & 0xff) << 24),
        j11 = (k[16] & 0xff) | ((k[17] & 0xff) << 8) | ((k[18] & 0xff) << 16) | ((k[19] & 0xff) << 24),
        j12 = (k[20] & 0xff) | ((k[21] & 0xff) << 8) | ((k[22] & 0xff) << 16) | ((k[23] & 0xff) << 24),
        j13 = (k[24] & 0xff) | ((k[25] & 0xff) << 8) | ((k[26] & 0xff) << 16) | ((k[27] & 0xff) << 24),
        j14 = (k[28] & 0xff) | ((k[29] & 0xff) << 8) | ((k[30] & 0xff) << 16) | ((k[31] & 0xff) << 24),
        j15 = (c[12] & 0xff) | ((c[13] & 0xff) << 8) | ((c[14] & 0xff) << 16) | ((c[15] & 0xff) << 24);

      var x0 = j0,
        x1 = j1,
        x2 = j2,
        x3 = j3,
        x4 = j4,
        x5 = j5,
        x6 = j6,
        x7 = j7,
        x8 = j8,
        x9 = j9,
        x10 = j10,
        x11 = j11,
        x12 = j12,
        x13 = j13,
        x14 = j14,
        x15 = j15,
        u;

      for (var i = 0; i < 20; i += 2) {
        u = (x0 + x12) | 0;
        x4 ^= (u << 7) | (u >>> (32 - 7));
        u = (x4 + x0) | 0;
        x8 ^= (u << 9) | (u >>> (32 - 9));
        u = (x8 + x4) | 0;
        x12 ^= (u << 13) | (u >>> (32 - 13));
        u = (x12 + x8) | 0;
        x0 ^= (u << 18) | (u >>> (32 - 18));

        u = (x5 + x1) | 0;
        x9 ^= (u << 7) | (u >>> (32 - 7));
        u = (x9 + x5) | 0;
        x13 ^= (u << 9) | (u >>> (32 - 9));
        u = (x13 + x9) | 0;
        x1 ^= (u << 13) | (u >>> (32 - 13));
        u = (x1 + x13) | 0;
        x5 ^= (u << 18) | (u >>> (32 - 18));

        u = (x10 + x6) | 0;
        x14 ^= (u << 7) | (u >>> (32 - 7));
        u = (x14 + x10) | 0;
        x2 ^= (u << 9) | (u >>> (32 - 9));
        u = (x2 + x14) | 0;
        x6 ^= (u << 13) | (u >>> (32 - 13));
        u = (x6 + x2) | 0;
        x10 ^= (u << 18) | (u >>> (32 - 18));

        u = (x15 + x11) | 0;
        x3 ^= (u << 7) | (u >>> (32 - 7));
        u = (x3 + x15) | 0;
        x7 ^= (u << 9) | (u >>> (32 - 9));
        u = (x7 + x3) | 0;
        x11 ^= (u << 13) | (u >>> (32 - 13));
        u = (x11 + x7) | 0;
        x15 ^= (u << 18) | (u >>> (32 - 18));

        u = (x0 + x3) | 0;
        x1 ^= (u << 7) | (u >>> (32 - 7));
        u = (x1 + x0) | 0;
        x2 ^= (u << 9) | (u >>> (32 - 9));
        u = (x2 + x1) | 0;
        x3 ^= (u << 13) | (u >>> (32 - 13));
        u = (x3 + x2) | 0;
        x0 ^= (u << 18) | (u >>> (32 - 18));

        u = (x5 + x4) | 0;
        x6 ^= (u << 7) | (u >>> (32 - 7));
        u = (x6 + x5) | 0;
        x7 ^= (u << 9) | (u >>> (32 - 9));
        u = (x7 + x6) | 0;
        x4 ^= (u << 13) | (u >>> (32 - 13));
        u = (x4 + x7) | 0;
        x5 ^= (u << 18) | (u >>> (32 - 18));

        u = (x10 + x9) | 0;
        x11 ^= (u << 7) | (u >>> (32 - 7));
        u = (x11 + x10) | 0;
        x8 ^= (u << 9) | (u >>> (32 - 9));
        u = (x8 + x11) | 0;
        x9 ^= (u << 13) | (u >>> (32 - 13));
        u = (x9 + x8) | 0;
        x10 ^= (u << 18) | (u >>> (32 - 18));

        u = (x15 + x14) | 0;
        x12 ^= (u << 7) | (u >>> (32 - 7));
        u = (x12 + x15) | 0;
        x13 ^= (u << 9) | (u >>> (32 - 9));
        u = (x13 + x12) | 0;
        x14 ^= (u << 13) | (u >>> (32 - 13));
        u = (x14 + x13) | 0;
        x15 ^= (u << 18) | (u >>> (32 - 18));
      }

      o[0] = (x0 >>> 0) & 0xff;
      o[1] = (x0 >>> 8) & 0xff;
      o[2] = (x0 >>> 16) & 0xff;
      o[3] = (x0 >>> 24) & 0xff;

      o[4] = (x5 >>> 0) & 0xff;
      o[5] = (x5 >>> 8) & 0xff;
      o[6] = (x5 >>> 16) & 0xff;
      o[7] = (x5 >>> 24) & 0xff;

      o[8] = (x10 >>> 0) & 0xff;
      o[9] = (x10 >>> 8) & 0xff;
      o[10] = (x10 >>> 16) & 0xff;
      o[11] = (x10 >>> 24) & 0xff;

      o[12] = (x15 >>> 0) & 0xff;
      o[13] = (x15 >>> 8) & 0xff;
      o[14] = (x15 >>> 16) & 0xff;
      o[15] = (x15 >>> 24) & 0xff;

      o[16] = (x6 >>> 0) & 0xff;
      o[17] = (x6 >>> 8) & 0xff;
      o[18] = (x6 >>> 16) & 0xff;
      o[19] = (x6 >>> 24) & 0xff;

      o[20] = (x7 >>> 0) & 0xff;
      o[21] = (x7 >>> 8) & 0xff;
      o[22] = (x7 >>> 16) & 0xff;
      o[23] = (x7 >>> 24) & 0xff;

      o[24] = (x8 >>> 0) & 0xff;
      o[25] = (x8 >>> 8) & 0xff;
      o[26] = (x8 >>> 16) & 0xff;
      o[27] = (x8 >>> 24) & 0xff;

      o[28] = (x9 >>> 0) & 0xff;
      o[29] = (x9 >>> 8) & 0xff;
      o[30] = (x9 >>> 16) & 0xff;
      o[31] = (x9 >>> 24) & 0xff;
    }

    function crypto_core_salsa20(out, inp, k, c) {
      core_salsa20(out, inp, k, c);
    }

    function crypto_core_hsalsa20(out, inp, k, c) {
      core_hsalsa20(out, inp, k, c);
    }

    var sigma = new Uint8Array([101, 120, 112, 97, 110, 100, 32, 51, 50, 45, 98, 121, 116, 101, 32, 107]);
    // "expand 32-byte k"

    function crypto_stream_salsa20_xor(c, cpos, m, mpos, b, n, k) {
      var z = new Uint8Array(16),
        x = new Uint8Array(64);
      var u, i;
      for (i = 0; i < 16; i++) z[i] = 0;
      for (i = 0; i < 8; i++) z[i] = n[i];
      while (b >= 64) {
        crypto_core_salsa20(x, z, k, sigma);
        for (i = 0; i < 64; i++) c[cpos + i] = m[mpos + i] ^ x[i];
        u = 1;
        for (i = 8; i < 16; i++) {
          u = (u + (z[i] & 0xff)) | 0;
          z[i] = u & 0xff;
          u >>>= 8;
        }
        b -= 64;
        cpos += 64;
        mpos += 64;
      }
      if (b > 0) {
        crypto_core_salsa20(x, z, k, sigma);
        for (i = 0; i < b; i++) c[cpos + i] = m[mpos + i] ^ x[i];
      }
      return 0;
    }

    function crypto_stream_salsa20(c, cpos, b, n, k) {
      var z = new Uint8Array(16),
        x = new Uint8Array(64);
      var u, i;
      for (i = 0; i < 16; i++) z[i] = 0;
      for (i = 0; i < 8; i++) z[i] = n[i];
      while (b >= 64) {
        crypto_core_salsa20(x, z, k, sigma);
        for (i = 0; i < 64; i++) c[cpos + i] = x[i];
        u = 1;
        for (i = 8; i < 16; i++) {
          u = (u + (z[i] & 0xff)) | 0;
          z[i] = u & 0xff;
          u >>>= 8;
        }
        b -= 64;
        cpos += 64;
      }
      if (b > 0) {
        crypto_core_salsa20(x, z, k, sigma);
        for (i = 0; i < b; i++) c[cpos + i] = x[i];
      }
      return 0;
    }

    function crypto_stream(c, cpos, d, n, k) {
      var s = new Uint8Array(32);
      crypto_core_hsalsa20(s, n, k, sigma);
      var sn = new Uint8Array(8);
      for (var i = 0; i < 8; i++) sn[i] = n[i + 16];
      return crypto_stream_salsa20(c, cpos, d, sn, s);
    }

    function crypto_stream_xor(c, cpos, m, mpos, d, n, k) {
      var s = new Uint8Array(32);
      crypto_core_hsalsa20(s, n, k, sigma);
      var sn = new Uint8Array(8);
      for (var i = 0; i < 8; i++) sn[i] = n[i + 16];
      return crypto_stream_salsa20_xor(c, cpos, m, mpos, d, sn, s);
    }

    /*
     * Port of Andrew Moon's Poly1305-donna-16. Public domain.
     * https://github.com/floodyberry/poly1305-donna
     */

    var poly1305 = function (key) {
      this.buffer = new Uint8Array(16);
      this.r = new Uint16Array(10);
      this.h = new Uint16Array(10);
      this.pad = new Uint16Array(8);
      this.leftover = 0;
      this.fin = 0;

      var t0, t1, t2, t3, t4, t5, t6, t7;

      t0 = (key[0] & 0xff) | ((key[1] & 0xff) << 8);
      this.r[0] = t0 & 0x1fff;
      t1 = (key[2] & 0xff) | ((key[3] & 0xff) << 8);
      this.r[1] = ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
      t2 = (key[4] & 0xff) | ((key[5] & 0xff) << 8);
      this.r[2] = ((t1 >>> 10) | (t2 << 6)) & 0x1f03;
      t3 = (key[6] & 0xff) | ((key[7] & 0xff) << 8);
      this.r[3] = ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
      t4 = (key[8] & 0xff) | ((key[9] & 0xff) << 8);
      this.r[4] = ((t3 >>> 4) | (t4 << 12)) & 0x00ff;
      this.r[5] = (t4 >>> 1) & 0x1ffe;
      t5 = (key[10] & 0xff) | ((key[11] & 0xff) << 8);
      this.r[6] = ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
      t6 = (key[12] & 0xff) | ((key[13] & 0xff) << 8);
      this.r[7] = ((t5 >>> 11) | (t6 << 5)) & 0x1f81;
      t7 = (key[14] & 0xff) | ((key[15] & 0xff) << 8);
      this.r[8] = ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
      this.r[9] = (t7 >>> 5) & 0x007f;

      this.pad[0] = (key[16] & 0xff) | ((key[17] & 0xff) << 8);
      this.pad[1] = (key[18] & 0xff) | ((key[19] & 0xff) << 8);
      this.pad[2] = (key[20] & 0xff) | ((key[21] & 0xff) << 8);
      this.pad[3] = (key[22] & 0xff) | ((key[23] & 0xff) << 8);
      this.pad[4] = (key[24] & 0xff) | ((key[25] & 0xff) << 8);
      this.pad[5] = (key[26] & 0xff) | ((key[27] & 0xff) << 8);
      this.pad[6] = (key[28] & 0xff) | ((key[29] & 0xff) << 8);
      this.pad[7] = (key[30] & 0xff) | ((key[31] & 0xff) << 8);
    };

    poly1305.prototype.blocks = function (m, mpos, bytes) {
      var hibit = this.fin ? 0 : 1 << 11;
      var t0, t1, t2, t3, t4, t5, t6, t7, c;
      var d0, d1, d2, d3, d4, d5, d6, d7, d8, d9;

      var h0 = this.h[0],
        h1 = this.h[1],
        h2 = this.h[2],
        h3 = this.h[3],
        h4 = this.h[4],
        h5 = this.h[5],
        h6 = this.h[6],
        h7 = this.h[7],
        h8 = this.h[8],
        h9 = this.h[9];

      var r0 = this.r[0],
        r1 = this.r[1],
        r2 = this.r[2],
        r3 = this.r[3],
        r4 = this.r[4],
        r5 = this.r[5],
        r6 = this.r[6],
        r7 = this.r[7],
        r8 = this.r[8],
        r9 = this.r[9];

      while (bytes >= 16) {
        t0 = (m[mpos + 0] & 0xff) | ((m[mpos + 1] & 0xff) << 8);
        h0 += t0 & 0x1fff;
        t1 = (m[mpos + 2] & 0xff) | ((m[mpos + 3] & 0xff) << 8);
        h1 += ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
        t2 = (m[mpos + 4] & 0xff) | ((m[mpos + 5] & 0xff) << 8);
        h2 += ((t1 >>> 10) | (t2 << 6)) & 0x1fff;
        t3 = (m[mpos + 6] & 0xff) | ((m[mpos + 7] & 0xff) << 8);
        h3 += ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
        t4 = (m[mpos + 8] & 0xff) | ((m[mpos + 9] & 0xff) << 8);
        h4 += ((t3 >>> 4) | (t4 << 12)) & 0x1fff;
        h5 += (t4 >>> 1) & 0x1fff;
        t5 = (m[mpos + 10] & 0xff) | ((m[mpos + 11] & 0xff) << 8);
        h6 += ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
        t6 = (m[mpos + 12] & 0xff) | ((m[mpos + 13] & 0xff) << 8);
        h7 += ((t5 >>> 11) | (t6 << 5)) & 0x1fff;
        t7 = (m[mpos + 14] & 0xff) | ((m[mpos + 15] & 0xff) << 8);
        h8 += ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
        h9 += (t7 >>> 5) | hibit;

        c = 0;

        d0 = c;
        d0 += h0 * r0;
        d0 += h1 * (5 * r9);
        d0 += h2 * (5 * r8);
        d0 += h3 * (5 * r7);
        d0 += h4 * (5 * r6);
        c = d0 >>> 13;
        d0 &= 0x1fff;
        d0 += h5 * (5 * r5);
        d0 += h6 * (5 * r4);
        d0 += h7 * (5 * r3);
        d0 += h8 * (5 * r2);
        d0 += h9 * (5 * r1);
        c += d0 >>> 13;
        d0 &= 0x1fff;

        d1 = c;
        d1 += h0 * r1;
        d1 += h1 * r0;
        d1 += h2 * (5 * r9);
        d1 += h3 * (5 * r8);
        d1 += h4 * (5 * r7);
        c = d1 >>> 13;
        d1 &= 0x1fff;
        d1 += h5 * (5 * r6);
        d1 += h6 * (5 * r5);
        d1 += h7 * (5 * r4);
        d1 += h8 * (5 * r3);
        d1 += h9 * (5 * r2);
        c += d1 >>> 13;
        d1 &= 0x1fff;

        d2 = c;
        d2 += h0 * r2;
        d2 += h1 * r1;
        d2 += h2 * r0;
        d2 += h3 * (5 * r9);
        d2 += h4 * (5 * r8);
        c = d2 >>> 13;
        d2 &= 0x1fff;
        d2 += h5 * (5 * r7);
        d2 += h6 * (5 * r6);
        d2 += h7 * (5 * r5);
        d2 += h8 * (5 * r4);
        d2 += h9 * (5 * r3);
        c += d2 >>> 13;
        d2 &= 0x1fff;

        d3 = c;
        d3 += h0 * r3;
        d3 += h1 * r2;
        d3 += h2 * r1;
        d3 += h3 * r0;
        d3 += h4 * (5 * r9);
        c = d3 >>> 13;
        d3 &= 0x1fff;
        d3 += h5 * (5 * r8);
        d3 += h6 * (5 * r7);
        d3 += h7 * (5 * r6);
        d3 += h8 * (5 * r5);
        d3 += h9 * (5 * r4);
        c += d3 >>> 13;
        d3 &= 0x1fff;

        d4 = c;
        d4 += h0 * r4;
        d4 += h1 * r3;
        d4 += h2 * r2;
        d4 += h3 * r1;
        d4 += h4 * r0;
        c = d4 >>> 13;
        d4 &= 0x1fff;
        d4 += h5 * (5 * r9);
        d4 += h6 * (5 * r8);
        d4 += h7 * (5 * r7);
        d4 += h8 * (5 * r6);
        d4 += h9 * (5 * r5);
        c += d4 >>> 13;
        d4 &= 0x1fff;

        d5 = c;
        d5 += h0 * r5;
        d5 += h1 * r4;
        d5 += h2 * r3;
        d5 += h3 * r2;
        d5 += h4 * r1;
        c = d5 >>> 13;
        d5 &= 0x1fff;
        d5 += h5 * r0;
        d5 += h6 * (5 * r9);
        d5 += h7 * (5 * r8);
        d5 += h8 * (5 * r7);
        d5 += h9 * (5 * r6);
        c += d5 >>> 13;
        d5 &= 0x1fff;

        d6 = c;
        d6 += h0 * r6;
        d6 += h1 * r5;
        d6 += h2 * r4;
        d6 += h3 * r3;
        d6 += h4 * r2;
        c = d6 >>> 13;
        d6 &= 0x1fff;
        d6 += h5 * r1;
        d6 += h6 * r0;
        d6 += h7 * (5 * r9);
        d6 += h8 * (5 * r8);
        d6 += h9 * (5 * r7);
        c += d6 >>> 13;
        d6 &= 0x1fff;

        d7 = c;
        d7 += h0 * r7;
        d7 += h1 * r6;
        d7 += h2 * r5;
        d7 += h3 * r4;
        d7 += h4 * r3;
        c = d7 >>> 13;
        d7 &= 0x1fff;
        d7 += h5 * r2;
        d7 += h6 * r1;
        d7 += h7 * r0;
        d7 += h8 * (5 * r9);
        d7 += h9 * (5 * r8);
        c += d7 >>> 13;
        d7 &= 0x1fff;

        d8 = c;
        d8 += h0 * r8;
        d8 += h1 * r7;
        d8 += h2 * r6;
        d8 += h3 * r5;
        d8 += h4 * r4;
        c = d8 >>> 13;
        d8 &= 0x1fff;
        d8 += h5 * r3;
        d8 += h6 * r2;
        d8 += h7 * r1;
        d8 += h8 * r0;
        d8 += h9 * (5 * r9);
        c += d8 >>> 13;
        d8 &= 0x1fff;

        d9 = c;
        d9 += h0 * r9;
        d9 += h1 * r8;
        d9 += h2 * r7;
        d9 += h3 * r6;
        d9 += h4 * r5;
        c = d9 >>> 13;
        d9 &= 0x1fff;
        d9 += h5 * r4;
        d9 += h6 * r3;
        d9 += h7 * r2;
        d9 += h8 * r1;
        d9 += h9 * r0;
        c += d9 >>> 13;
        d9 &= 0x1fff;

        c = ((c << 2) + c) | 0;
        c = (c + d0) | 0;
        d0 = c & 0x1fff;
        c = c >>> 13;
        d1 += c;

        h0 = d0;
        h1 = d1;
        h2 = d2;
        h3 = d3;
        h4 = d4;
        h5 = d5;
        h6 = d6;
        h7 = d7;
        h8 = d8;
        h9 = d9;

        mpos += 16;
        bytes -= 16;
      }
      this.h[0] = h0;
      this.h[1] = h1;
      this.h[2] = h2;
      this.h[3] = h3;
      this.h[4] = h4;
      this.h[5] = h5;
      this.h[6] = h6;
      this.h[7] = h7;
      this.h[8] = h8;
      this.h[9] = h9;
    };

    poly1305.prototype.finish = function (mac, macpos) {
      var g = new Uint16Array(10);
      var c, mask, f, i;

      if (this.leftover) {
        i = this.leftover;
        this.buffer[i++] = 1;
        for (; i < 16; i++) this.buffer[i] = 0;
        this.fin = 1;
        this.blocks(this.buffer, 0, 16);
      }

      c = this.h[1] >>> 13;
      this.h[1] &= 0x1fff;
      for (i = 2; i < 10; i++) {
        this.h[i] += c;
        c = this.h[i] >>> 13;
        this.h[i] &= 0x1fff;
      }
      this.h[0] += c * 5;
      c = this.h[0] >>> 13;
      this.h[0] &= 0x1fff;
      this.h[1] += c;
      c = this.h[1] >>> 13;
      this.h[1] &= 0x1fff;
      this.h[2] += c;

      g[0] = this.h[0] + 5;
      c = g[0] >>> 13;
      g[0] &= 0x1fff;
      for (i = 1; i < 10; i++) {
        g[i] = this.h[i] + c;
        c = g[i] >>> 13;
        g[i] &= 0x1fff;
      }
      g[9] -= 1 << 13;

      mask = (c ^ 1) - 1;
      for (i = 0; i < 10; i++) g[i] &= mask;
      mask = ~mask;
      for (i = 0; i < 10; i++) this.h[i] = (this.h[i] & mask) | g[i];

      this.h[0] = (this.h[0] | (this.h[1] << 13)) & 0xffff;
      this.h[1] = ((this.h[1] >>> 3) | (this.h[2] << 10)) & 0xffff;
      this.h[2] = ((this.h[2] >>> 6) | (this.h[3] << 7)) & 0xffff;
      this.h[3] = ((this.h[3] >>> 9) | (this.h[4] << 4)) & 0xffff;
      this.h[4] = ((this.h[4] >>> 12) | (this.h[5] << 1) | (this.h[6] << 14)) & 0xffff;
      this.h[5] = ((this.h[6] >>> 2) | (this.h[7] << 11)) & 0xffff;
      this.h[6] = ((this.h[7] >>> 5) | (this.h[8] << 8)) & 0xffff;
      this.h[7] = ((this.h[8] >>> 8) | (this.h[9] << 5)) & 0xffff;

      f = this.h[0] + this.pad[0];
      this.h[0] = f & 0xffff;
      for (i = 1; i < 8; i++) {
        f = (((this.h[i] + this.pad[i]) | 0) + (f >>> 16)) | 0;
        this.h[i] = f & 0xffff;
      }

      mac[macpos + 0] = (this.h[0] >>> 0) & 0xff;
      mac[macpos + 1] = (this.h[0] >>> 8) & 0xff;
      mac[macpos + 2] = (this.h[1] >>> 0) & 0xff;
      mac[macpos + 3] = (this.h[1] >>> 8) & 0xff;
      mac[macpos + 4] = (this.h[2] >>> 0) & 0xff;
      mac[macpos + 5] = (this.h[2] >>> 8) & 0xff;
      mac[macpos + 6] = (this.h[3] >>> 0) & 0xff;
      mac[macpos + 7] = (this.h[3] >>> 8) & 0xff;
      mac[macpos + 8] = (this.h[4] >>> 0) & 0xff;
      mac[macpos + 9] = (this.h[4] >>> 8) & 0xff;
      mac[macpos + 10] = (this.h[5] >>> 0) & 0xff;
      mac[macpos + 11] = (this.h[5] >>> 8) & 0xff;
      mac[macpos + 12] = (this.h[6] >>> 0) & 0xff;
      mac[macpos + 13] = (this.h[6] >>> 8) & 0xff;
      mac[macpos + 14] = (this.h[7] >>> 0) & 0xff;
      mac[macpos + 15] = (this.h[7] >>> 8) & 0xff;
    };

    poly1305.prototype.update = function (m, mpos, bytes) {
      var i, want;

      if (this.leftover) {
        want = 16 - this.leftover;
        if (want > bytes) want = bytes;
        for (i = 0; i < want; i++) this.buffer[this.leftover + i] = m[mpos + i];
        bytes -= want;
        mpos += want;
        this.leftover += want;
        if (this.leftover < 16) return;
        this.blocks(this.buffer, 0, 16);
        this.leftover = 0;
      }

      if (bytes >= 16) {
        want = bytes - (bytes % 16);
        this.blocks(m, mpos, want);
        mpos += want;
        bytes -= want;
      }

      if (bytes) {
        for (i = 0; i < bytes; i++) this.buffer[this.leftover + i] = m[mpos + i];
        this.leftover += bytes;
      }
    };

    function crypto_onetimeauth(out, outpos, m, mpos, n, k) {
      var s = new poly1305(k);
      s.update(m, mpos, n);
      s.finish(out, outpos);
      return 0;
    }

    function crypto_onetimeauth_verify(h, hpos, m, mpos, n, k) {
      var x = new Uint8Array(16);
      crypto_onetimeauth(x, 0, m, mpos, n, k);
      return crypto_verify_16(h, hpos, x, 0);
    }

    function crypto_secretbox(c, m, d, n, k) {
      var i;
      if (d < 32) return -1;
      crypto_stream_xor(c, 0, m, 0, d, n, k);
      crypto_onetimeauth(c, 16, c, 32, d - 32, c);
      for (i = 0; i < 16; i++) c[i] = 0;
      return 0;
    }

    function crypto_secretbox_open(m, c, d, n, k) {
      var i;
      var x = new Uint8Array(32);
      if (d < 32) return -1;
      crypto_stream(x, 0, 32, n, k);
      if (crypto_onetimeauth_verify(c, 16, c, 32, d - 32, x) !== 0) return -1;
      crypto_stream_xor(m, 0, c, 0, d, n, k);
      for (i = 0; i < 32; i++) m[i] = 0;
      return 0;
    }

    function set25519(r, a) {
      var i;
      for (i = 0; i < 16; i++) r[i] = a[i] | 0;
    }

    function car25519(o) {
      var i,
        v,
        c = 1;
      for (i = 0; i < 16; i++) {
        v = o[i] + c + 65535;
        c = Math.floor(v / 65536);
        o[i] = v - c * 65536;
      }
      o[0] += c - 1 + 37 * (c - 1);
    }

    function sel25519(p, q, b) {
      var t,
        c = ~(b - 1);
      for (var i = 0; i < 16; i++) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
      }
    }

    function pack25519(o, n) {
      var i, j, b;
      var m = gf(),
        t = gf();
      for (i = 0; i < 16; i++) t[i] = n[i];
      car25519(t);
      car25519(t);
      car25519(t);
      for (j = 0; j < 2; j++) {
        m[0] = t[0] - 0xffed;
        for (i = 1; i < 15; i++) {
          m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
          m[i - 1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
        b = (m[15] >> 16) & 1;
        m[14] &= 0xffff;
        sel25519(t, m, 1 - b);
      }
      for (i = 0; i < 16; i++) {
        o[2 * i] = t[i] & 0xff;
        o[2 * i + 1] = t[i] >> 8;
      }
    }

    function neq25519(a, b) {
      var c = new Uint8Array(32),
        d = new Uint8Array(32);
      pack25519(c, a);
      pack25519(d, b);
      return crypto_verify_32(c, 0, d, 0);
    }

    function par25519(a) {
      var d = new Uint8Array(32);
      pack25519(d, a);
      return d[0] & 1;
    }

    function unpack25519(o, n) {
      var i;
      for (i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
      o[15] &= 0x7fff;
    }

    function A(o, a, b) {
      for (var i = 0; i < 16; i++) o[i] = a[i] + b[i];
    }

    function Z(o, a, b) {
      for (var i = 0; i < 16; i++) o[i] = a[i] - b[i];
    }

    function M(o, a, b) {
      var v,
        c,
        t0 = 0,
        t1 = 0,
        t2 = 0,
        t3 = 0,
        t4 = 0,
        t5 = 0,
        t6 = 0,
        t7 = 0,
        t8 = 0,
        t9 = 0,
        t10 = 0,
        t11 = 0,
        t12 = 0,
        t13 = 0,
        t14 = 0,
        t15 = 0,
        t16 = 0,
        t17 = 0,
        t18 = 0,
        t19 = 0,
        t20 = 0,
        t21 = 0,
        t22 = 0,
        t23 = 0,
        t24 = 0,
        t25 = 0,
        t26 = 0,
        t27 = 0,
        t28 = 0,
        t29 = 0,
        t30 = 0,
        b0 = b[0],
        b1 = b[1],
        b2 = b[2],
        b3 = b[3],
        b4 = b[4],
        b5 = b[5],
        b6 = b[6],
        b7 = b[7],
        b8 = b[8],
        b9 = b[9],
        b10 = b[10],
        b11 = b[11],
        b12 = b[12],
        b13 = b[13],
        b14 = b[14],
        b15 = b[15];

      v = a[0];
      t0 += v * b0;
      t1 += v * b1;
      t2 += v * b2;
      t3 += v * b3;
      t4 += v * b4;
      t5 += v * b5;
      t6 += v * b6;
      t7 += v * b7;
      t8 += v * b8;
      t9 += v * b9;
      t10 += v * b10;
      t11 += v * b11;
      t12 += v * b12;
      t13 += v * b13;
      t14 += v * b14;
      t15 += v * b15;
      v = a[1];
      t1 += v * b0;
      t2 += v * b1;
      t3 += v * b2;
      t4 += v * b3;
      t5 += v * b4;
      t6 += v * b5;
      t7 += v * b6;
      t8 += v * b7;
      t9 += v * b8;
      t10 += v * b9;
      t11 += v * b10;
      t12 += v * b11;
      t13 += v * b12;
      t14 += v * b13;
      t15 += v * b14;
      t16 += v * b15;
      v = a[2];
      t2 += v * b0;
      t3 += v * b1;
      t4 += v * b2;
      t5 += v * b3;
      t6 += v * b4;
      t7 += v * b5;
      t8 += v * b6;
      t9 += v * b7;
      t10 += v * b8;
      t11 += v * b9;
      t12 += v * b10;
      t13 += v * b11;
      t14 += v * b12;
      t15 += v * b13;
      t16 += v * b14;
      t17 += v * b15;
      v = a[3];
      t3 += v * b0;
      t4 += v * b1;
      t5 += v * b2;
      t6 += v * b3;
      t7 += v * b4;
      t8 += v * b5;
      t9 += v * b6;
      t10 += v * b7;
      t11 += v * b8;
      t12 += v * b9;
      t13 += v * b10;
      t14 += v * b11;
      t15 += v * b12;
      t16 += v * b13;
      t17 += v * b14;
      t18 += v * b15;
      v = a[4];
      t4 += v * b0;
      t5 += v * b1;
      t6 += v * b2;
      t7 += v * b3;
      t8 += v * b4;
      t9 += v * b5;
      t10 += v * b6;
      t11 += v * b7;
      t12 += v * b8;
      t13 += v * b9;
      t14 += v * b10;
      t15 += v * b11;
      t16 += v * b12;
      t17 += v * b13;
      t18 += v * b14;
      t19 += v * b15;
      v = a[5];
      t5 += v * b0;
      t6 += v * b1;
      t7 += v * b2;
      t8 += v * b3;
      t9 += v * b4;
      t10 += v * b5;
      t11 += v * b6;
      t12 += v * b7;
      t13 += v * b8;
      t14 += v * b9;
      t15 += v * b10;
      t16 += v * b11;
      t17 += v * b12;
      t18 += v * b13;
      t19 += v * b14;
      t20 += v * b15;
      v = a[6];
      t6 += v * b0;
      t7 += v * b1;
      t8 += v * b2;
      t9 += v * b3;
      t10 += v * b4;
      t11 += v * b5;
      t12 += v * b6;
      t13 += v * b7;
      t14 += v * b8;
      t15 += v * b9;
      t16 += v * b10;
      t17 += v * b11;
      t18 += v * b12;
      t19 += v * b13;
      t20 += v * b14;
      t21 += v * b15;
      v = a[7];
      t7 += v * b0;
      t8 += v * b1;
      t9 += v * b2;
      t10 += v * b3;
      t11 += v * b4;
      t12 += v * b5;
      t13 += v * b6;
      t14 += v * b7;
      t15 += v * b8;
      t16 += v * b9;
      t17 += v * b10;
      t18 += v * b11;
      t19 += v * b12;
      t20 += v * b13;
      t21 += v * b14;
      t22 += v * b15;
      v = a[8];
      t8 += v * b0;
      t9 += v * b1;
      t10 += v * b2;
      t11 += v * b3;
      t12 += v * b4;
      t13 += v * b5;
      t14 += v * b6;
      t15 += v * b7;
      t16 += v * b8;
      t17 += v * b9;
      t18 += v * b10;
      t19 += v * b11;
      t20 += v * b12;
      t21 += v * b13;
      t22 += v * b14;
      t23 += v * b15;
      v = a[9];
      t9 += v * b0;
      t10 += v * b1;
      t11 += v * b2;
      t12 += v * b3;
      t13 += v * b4;
      t14 += v * b5;
      t15 += v * b6;
      t16 += v * b7;
      t17 += v * b8;
      t18 += v * b9;
      t19 += v * b10;
      t20 += v * b11;
      t21 += v * b12;
      t22 += v * b13;
      t23 += v * b14;
      t24 += v * b15;
      v = a[10];
      t10 += v * b0;
      t11 += v * b1;
      t12 += v * b2;
      t13 += v * b3;
      t14 += v * b4;
      t15 += v * b5;
      t16 += v * b6;
      t17 += v * b7;
      t18 += v * b8;
      t19 += v * b9;
      t20 += v * b10;
      t21 += v * b11;
      t22 += v * b12;
      t23 += v * b13;
      t24 += v * b14;
      t25 += v * b15;
      v = a[11];
      t11 += v * b0;
      t12 += v * b1;
      t13 += v * b2;
      t14 += v * b3;
      t15 += v * b4;
      t16 += v * b5;
      t17 += v * b6;
      t18 += v * b7;
      t19 += v * b8;
      t20 += v * b9;
      t21 += v * b10;
      t22 += v * b11;
      t23 += v * b12;
      t24 += v * b13;
      t25 += v * b14;
      t26 += v * b15;
      v = a[12];
      t12 += v * b0;
      t13 += v * b1;
      t14 += v * b2;
      t15 += v * b3;
      t16 += v * b4;
      t17 += v * b5;
      t18 += v * b6;
      t19 += v * b7;
      t20 += v * b8;
      t21 += v * b9;
      t22 += v * b10;
      t23 += v * b11;
      t24 += v * b12;
      t25 += v * b13;
      t26 += v * b14;
      t27 += v * b15;
      v = a[13];
      t13 += v * b0;
      t14 += v * b1;
      t15 += v * b2;
      t16 += v * b3;
      t17 += v * b4;
      t18 += v * b5;
      t19 += v * b6;
      t20 += v * b7;
      t21 += v * b8;
      t22 += v * b9;
      t23 += v * b10;
      t24 += v * b11;
      t25 += v * b12;
      t26 += v * b13;
      t27 += v * b14;
      t28 += v * b15;
      v = a[14];
      t14 += v * b0;
      t15 += v * b1;
      t16 += v * b2;
      t17 += v * b3;
      t18 += v * b4;
      t19 += v * b5;
      t20 += v * b6;
      t21 += v * b7;
      t22 += v * b8;
      t23 += v * b9;
      t24 += v * b10;
      t25 += v * b11;
      t26 += v * b12;
      t27 += v * b13;
      t28 += v * b14;
      t29 += v * b15;
      v = a[15];
      t15 += v * b0;
      t16 += v * b1;
      t17 += v * b2;
      t18 += v * b3;
      t19 += v * b4;
      t20 += v * b5;
      t21 += v * b6;
      t22 += v * b7;
      t23 += v * b8;
      t24 += v * b9;
      t25 += v * b10;
      t26 += v * b11;
      t27 += v * b12;
      t28 += v * b13;
      t29 += v * b14;
      t30 += v * b15;

      t0 += 38 * t16;
      t1 += 38 * t17;
      t2 += 38 * t18;
      t3 += 38 * t19;
      t4 += 38 * t20;
      t5 += 38 * t21;
      t6 += 38 * t22;
      t7 += 38 * t23;
      t8 += 38 * t24;
      t9 += 38 * t25;
      t10 += 38 * t26;
      t11 += 38 * t27;
      t12 += 38 * t28;
      t13 += 38 * t29;
      t14 += 38 * t30;
      // t15 left as is

      // first car
      c = 1;
      v = t0 + c + 65535;
      c = Math.floor(v / 65536);
      t0 = v - c * 65536;
      v = t1 + c + 65535;
      c = Math.floor(v / 65536);
      t1 = v - c * 65536;
      v = t2 + c + 65535;
      c = Math.floor(v / 65536);
      t2 = v - c * 65536;
      v = t3 + c + 65535;
      c = Math.floor(v / 65536);
      t3 = v - c * 65536;
      v = t4 + c + 65535;
      c = Math.floor(v / 65536);
      t4 = v - c * 65536;
      v = t5 + c + 65535;
      c = Math.floor(v / 65536);
      t5 = v - c * 65536;
      v = t6 + c + 65535;
      c = Math.floor(v / 65536);
      t6 = v - c * 65536;
      v = t7 + c + 65535;
      c = Math.floor(v / 65536);
      t7 = v - c * 65536;
      v = t8 + c + 65535;
      c = Math.floor(v / 65536);
      t8 = v - c * 65536;
      v = t9 + c + 65535;
      c = Math.floor(v / 65536);
      t9 = v - c * 65536;
      v = t10 + c + 65535;
      c = Math.floor(v / 65536);
      t10 = v - c * 65536;
      v = t11 + c + 65535;
      c = Math.floor(v / 65536);
      t11 = v - c * 65536;
      v = t12 + c + 65535;
      c = Math.floor(v / 65536);
      t12 = v - c * 65536;
      v = t13 + c + 65535;
      c = Math.floor(v / 65536);
      t13 = v - c * 65536;
      v = t14 + c + 65535;
      c = Math.floor(v / 65536);
      t14 = v - c * 65536;
      v = t15 + c + 65535;
      c = Math.floor(v / 65536);
      t15 = v - c * 65536;
      t0 += c - 1 + 37 * (c - 1);

      // second car
      c = 1;
      v = t0 + c + 65535;
      c = Math.floor(v / 65536);
      t0 = v - c * 65536;
      v = t1 + c + 65535;
      c = Math.floor(v / 65536);
      t1 = v - c * 65536;
      v = t2 + c + 65535;
      c = Math.floor(v / 65536);
      t2 = v - c * 65536;
      v = t3 + c + 65535;
      c = Math.floor(v / 65536);
      t3 = v - c * 65536;
      v = t4 + c + 65535;
      c = Math.floor(v / 65536);
      t4 = v - c * 65536;
      v = t5 + c + 65535;
      c = Math.floor(v / 65536);
      t5 = v - c * 65536;
      v = t6 + c + 65535;
      c = Math.floor(v / 65536);
      t6 = v - c * 65536;
      v = t7 + c + 65535;
      c = Math.floor(v / 65536);
      t7 = v - c * 65536;
      v = t8 + c + 65535;
      c = Math.floor(v / 65536);
      t8 = v - c * 65536;
      v = t9 + c + 65535;
      c = Math.floor(v / 65536);
      t9 = v - c * 65536;
      v = t10 + c + 65535;
      c = Math.floor(v / 65536);
      t10 = v - c * 65536;
      v = t11 + c + 65535;
      c = Math.floor(v / 65536);
      t11 = v - c * 65536;
      v = t12 + c + 65535;
      c = Math.floor(v / 65536);
      t12 = v - c * 65536;
      v = t13 + c + 65535;
      c = Math.floor(v / 65536);
      t13 = v - c * 65536;
      v = t14 + c + 65535;
      c = Math.floor(v / 65536);
      t14 = v - c * 65536;
      v = t15 + c + 65535;
      c = Math.floor(v / 65536);
      t15 = v - c * 65536;
      t0 += c - 1 + 37 * (c - 1);

      o[0] = t0;
      o[1] = t1;
      o[2] = t2;
      o[3] = t3;
      o[4] = t4;
      o[5] = t5;
      o[6] = t6;
      o[7] = t7;
      o[8] = t8;
      o[9] = t9;
      o[10] = t10;
      o[11] = t11;
      o[12] = t12;
      o[13] = t13;
      o[14] = t14;
      o[15] = t15;
    }

    function S(o, a) {
      M(o, a, a);
    }

    function inv25519(o, i) {
      var c = gf();
      var a;
      for (a = 0; a < 16; a++) c[a] = i[a];
      for (a = 253; a >= 0; a--) {
        S(c, c);
        if (a !== 2 && a !== 4) M(c, c, i);
      }
      for (a = 0; a < 16; a++) o[a] = c[a];
    }

    function pow2523(o, i) {
      var c = gf();
      var a;
      for (a = 0; a < 16; a++) c[a] = i[a];
      for (a = 250; a >= 0; a--) {
        S(c, c);
        if (a !== 1) M(c, c, i);
      }
      for (a = 0; a < 16; a++) o[a] = c[a];
    }

    function crypto_scalarmult(q, n, p) {
      var z = new Uint8Array(32);
      var x = new Float64Array(80),
        r,
        i;
      var a = gf(),
        b = gf(),
        c = gf(),
        d = gf(),
        e = gf(),
        f = gf();
      for (i = 0; i < 31; i++) z[i] = n[i];
      z[31] = (n[31] & 127) | 64;
      z[0] &= 248;
      unpack25519(x, p);
      for (i = 0; i < 16; i++) {
        b[i] = x[i];
        d[i] = a[i] = c[i] = 0;
      }
      a[0] = d[0] = 1;
      for (i = 254; i >= 0; --i) {
        r = (z[i >>> 3] >>> (i & 7)) & 1;
        sel25519(a, b, r);
        sel25519(c, d, r);
        A(e, a, c);
        Z(a, a, c);
        A(c, b, d);
        Z(b, b, d);
        S(d, e);
        S(f, a);
        M(a, c, a);
        M(c, b, e);
        A(e, a, c);
        Z(a, a, c);
        S(b, a);
        Z(c, d, f);
        M(a, c, _121665);
        A(a, a, d);
        M(c, c, a);
        M(a, d, f);
        M(d, b, x);
        S(b, e);
        sel25519(a, b, r);
        sel25519(c, d, r);
      }
      for (i = 0; i < 16; i++) {
        x[i + 16] = a[i];
        x[i + 32] = c[i];
        x[i + 48] = b[i];
        x[i + 64] = d[i];
      }
      var x32 = x.subarray(32);
      var x16 = x.subarray(16);
      inv25519(x32, x32);
      M(x16, x16, x32);
      pack25519(q, x16);
      return 0;
    }

    function crypto_scalarmult_base(q, n) {
      return crypto_scalarmult(q, n, _9);
    }

    function crypto_box_keypair(y, x) {
      randombytes(x, 32);
      return crypto_scalarmult_base(y, x);
    }

    function crypto_box_beforenm(k, y, x) {
      var s = new Uint8Array(32);
      crypto_scalarmult(s, x, y);
      return crypto_core_hsalsa20(k, _0, s, sigma);
    }

    var crypto_box_afternm = crypto_secretbox;
    var crypto_box_open_afternm = crypto_secretbox_open;

    function crypto_box(c, m, d, n, y, x) {
      var k = new Uint8Array(32);
      crypto_box_beforenm(k, y, x);
      return crypto_box_afternm(c, m, d, n, k);
    }

    function crypto_box_open(m, c, d, n, y, x) {
      var k = new Uint8Array(32);
      crypto_box_beforenm(k, y, x);
      return crypto_box_open_afternm(m, c, d, n, k);
    }

    var K = [
      0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b,
      0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242,
      0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe,
      0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
      0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc,
      0xbd41fbd4, 0x76f988da, 0x831153b5, 0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f,
      0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967,
      0x0a0e6e70, 0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
      0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b, 0xa2bfe8a1,
      0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218,
      0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8, 0x19a4c116, 0xb8d2d0c8, 0x1e376c08,
      0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
      0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814,
      0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915,
      0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f,
      0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
      0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be,
      0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
    ];

    function crypto_hashblocks_hl(hh, hl, m, n) {
      var wh = new Int32Array(16),
        wl = new Int32Array(16),
        bh0,
        bh1,
        bh2,
        bh3,
        bh4,
        bh5,
        bh6,
        bh7,
        bl0,
        bl1,
        bl2,
        bl3,
        bl4,
        bl5,
        bl6,
        bl7,
        th,
        tl,
        i,
        j,
        h,
        l,
        a,
        b,
        c,
        d;

      var ah0 = hh[0],
        ah1 = hh[1],
        ah2 = hh[2],
        ah3 = hh[3],
        ah4 = hh[4],
        ah5 = hh[5],
        ah6 = hh[6],
        ah7 = hh[7],
        al0 = hl[0],
        al1 = hl[1],
        al2 = hl[2],
        al3 = hl[3],
        al4 = hl[4],
        al5 = hl[5],
        al6 = hl[6],
        al7 = hl[7];

      var pos = 0;
      while (n >= 128) {
        for (i = 0; i < 16; i++) {
          j = 8 * i + pos;
          wh[i] = (m[j + 0] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
          wl[i] = (m[j + 4] << 24) | (m[j + 5] << 16) | (m[j + 6] << 8) | m[j + 7];
        }
        for (i = 0; i < 80; i++) {
          bh0 = ah0;
          bh1 = ah1;
          bh2 = ah2;
          bh3 = ah3;
          bh4 = ah4;
          bh5 = ah5;
          bh6 = ah6;
          bh7 = ah7;

          bl0 = al0;
          bl1 = al1;
          bl2 = al2;
          bl3 = al3;
          bl4 = al4;
          bl5 = al5;
          bl6 = al6;
          bl7 = al7;

          // add
          h = ah7;
          l = al7;

          a = l & 0xffff;
          b = l >>> 16;
          c = h & 0xffff;
          d = h >>> 16;

          // Sigma1
          h =
            ((ah4 >>> 14) | (al4 << (32 - 14))) ^
            ((ah4 >>> 18) | (al4 << (32 - 18))) ^
            ((al4 >>> (41 - 32)) | (ah4 << (32 - (41 - 32))));
          l =
            ((al4 >>> 14) | (ah4 << (32 - 14))) ^
            ((al4 >>> 18) | (ah4 << (32 - 18))) ^
            ((ah4 >>> (41 - 32)) | (al4 << (32 - (41 - 32))));

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          // Ch
          h = (ah4 & ah5) ^ (~ah4 & ah6);
          l = (al4 & al5) ^ (~al4 & al6);

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          // K
          h = K[i * 2];
          l = K[i * 2 + 1];

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          // w
          h = wh[i % 16];
          l = wl[i % 16];

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          th = (c & 0xffff) | (d << 16);
          tl = (a & 0xffff) | (b << 16);

          // add
          h = th;
          l = tl;

          a = l & 0xffff;
          b = l >>> 16;
          c = h & 0xffff;
          d = h >>> 16;

          // Sigma0
          h =
            ((ah0 >>> 28) | (al0 << (32 - 28))) ^
            ((al0 >>> (34 - 32)) | (ah0 << (32 - (34 - 32)))) ^
            ((al0 >>> (39 - 32)) | (ah0 << (32 - (39 - 32))));
          l =
            ((al0 >>> 28) | (ah0 << (32 - 28))) ^
            ((ah0 >>> (34 - 32)) | (al0 << (32 - (34 - 32)))) ^
            ((ah0 >>> (39 - 32)) | (al0 << (32 - (39 - 32))));

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          // Maj
          h = (ah0 & ah1) ^ (ah0 & ah2) ^ (ah1 & ah2);
          l = (al0 & al1) ^ (al0 & al2) ^ (al1 & al2);

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          bh7 = (c & 0xffff) | (d << 16);
          bl7 = (a & 0xffff) | (b << 16);

          // add
          h = bh3;
          l = bl3;

          a = l & 0xffff;
          b = l >>> 16;
          c = h & 0xffff;
          d = h >>> 16;

          h = th;
          l = tl;

          a += l & 0xffff;
          b += l >>> 16;
          c += h & 0xffff;
          d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          bh3 = (c & 0xffff) | (d << 16);
          bl3 = (a & 0xffff) | (b << 16);

          ah1 = bh0;
          ah2 = bh1;
          ah3 = bh2;
          ah4 = bh3;
          ah5 = bh4;
          ah6 = bh5;
          ah7 = bh6;
          ah0 = bh7;

          al1 = bl0;
          al2 = bl1;
          al3 = bl2;
          al4 = bl3;
          al5 = bl4;
          al6 = bl5;
          al7 = bl6;
          al0 = bl7;

          if (i % 16 === 15) {
            for (j = 0; j < 16; j++) {
              // add
              h = wh[j];
              l = wl[j];

              a = l & 0xffff;
              b = l >>> 16;
              c = h & 0xffff;
              d = h >>> 16;

              h = wh[(j + 9) % 16];
              l = wl[(j + 9) % 16];

              a += l & 0xffff;
              b += l >>> 16;
              c += h & 0xffff;
              d += h >>> 16;

              // sigma0
              th = wh[(j + 1) % 16];
              tl = wl[(j + 1) % 16];
              h = ((th >>> 1) | (tl << (32 - 1))) ^ ((th >>> 8) | (tl << (32 - 8))) ^ (th >>> 7);
              l = ((tl >>> 1) | (th << (32 - 1))) ^ ((tl >>> 8) | (th << (32 - 8))) ^ ((tl >>> 7) | (th << (32 - 7)));

              a += l & 0xffff;
              b += l >>> 16;
              c += h & 0xffff;
              d += h >>> 16;

              // sigma1
              th = wh[(j + 14) % 16];
              tl = wl[(j + 14) % 16];
              h = ((th >>> 19) | (tl << (32 - 19))) ^ ((tl >>> (61 - 32)) | (th << (32 - (61 - 32)))) ^ (th >>> 6);
              l =
                ((tl >>> 19) | (th << (32 - 19))) ^
                ((th >>> (61 - 32)) | (tl << (32 - (61 - 32)))) ^
                ((tl >>> 6) | (th << (32 - 6)));

              a += l & 0xffff;
              b += l >>> 16;
              c += h & 0xffff;
              d += h >>> 16;

              b += a >>> 16;
              c += b >>> 16;
              d += c >>> 16;

              wh[j] = (c & 0xffff) | (d << 16);
              wl[j] = (a & 0xffff) | (b << 16);
            }
          }
        }

        // add
        h = ah0;
        l = al0;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[0];
        l = hl[0];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[0] = ah0 = (c & 0xffff) | (d << 16);
        hl[0] = al0 = (a & 0xffff) | (b << 16);

        h = ah1;
        l = al1;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[1];
        l = hl[1];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[1] = ah1 = (c & 0xffff) | (d << 16);
        hl[1] = al1 = (a & 0xffff) | (b << 16);

        h = ah2;
        l = al2;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[2];
        l = hl[2];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[2] = ah2 = (c & 0xffff) | (d << 16);
        hl[2] = al2 = (a & 0xffff) | (b << 16);

        h = ah3;
        l = al3;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[3];
        l = hl[3];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[3] = ah3 = (c & 0xffff) | (d << 16);
        hl[3] = al3 = (a & 0xffff) | (b << 16);

        h = ah4;
        l = al4;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[4];
        l = hl[4];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[4] = ah4 = (c & 0xffff) | (d << 16);
        hl[4] = al4 = (a & 0xffff) | (b << 16);

        h = ah5;
        l = al5;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[5];
        l = hl[5];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[5] = ah5 = (c & 0xffff) | (d << 16);
        hl[5] = al5 = (a & 0xffff) | (b << 16);

        h = ah6;
        l = al6;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[6];
        l = hl[6];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[6] = ah6 = (c & 0xffff) | (d << 16);
        hl[6] = al6 = (a & 0xffff) | (b << 16);

        h = ah7;
        l = al7;

        a = l & 0xffff;
        b = l >>> 16;
        c = h & 0xffff;
        d = h >>> 16;

        h = hh[7];
        l = hl[7];

        a += l & 0xffff;
        b += l >>> 16;
        c += h & 0xffff;
        d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[7] = ah7 = (c & 0xffff) | (d << 16);
        hl[7] = al7 = (a & 0xffff) | (b << 16);

        pos += 128;
        n -= 128;
      }

      return n;
    }

    function crypto_hash(out, m, n) {
      var hh = new Int32Array(8),
        hl = new Int32Array(8),
        x = new Uint8Array(256),
        i,
        b = n;

      hh[0] = 0x6a09e667;
      hh[1] = 0xbb67ae85;
      hh[2] = 0x3c6ef372;
      hh[3] = 0xa54ff53a;
      hh[4] = 0x510e527f;
      hh[5] = 0x9b05688c;
      hh[6] = 0x1f83d9ab;
      hh[7] = 0x5be0cd19;

      hl[0] = 0xf3bcc908;
      hl[1] = 0x84caa73b;
      hl[2] = 0xfe94f82b;
      hl[3] = 0x5f1d36f1;
      hl[4] = 0xade682d1;
      hl[5] = 0x2b3e6c1f;
      hl[6] = 0xfb41bd6b;
      hl[7] = 0x137e2179;

      crypto_hashblocks_hl(hh, hl, m, n);
      n %= 128;

      for (i = 0; i < n; i++) x[i] = m[b - n + i];
      x[n] = 128;

      n = 256 - 128 * (n < 112 ? 1 : 0);
      x[n - 9] = 0;
      ts64(x, n - 8, (b / 0x20000000) | 0, b << 3);
      crypto_hashblocks_hl(hh, hl, x, n);

      for (i = 0; i < 8; i++) ts64(out, 8 * i, hh[i], hl[i]);

      return 0;
    }

    function add(p, q) {
      var a = gf(),
        b = gf(),
        c = gf(),
        d = gf(),
        e = gf(),
        f = gf(),
        g = gf(),
        h = gf(),
        t = gf();

      Z(a, p[1], p[0]);
      Z(t, q[1], q[0]);
      M(a, a, t);
      A(b, p[0], p[1]);
      A(t, q[0], q[1]);
      M(b, b, t);
      M(c, p[3], q[3]);
      M(c, c, D2);
      M(d, p[2], q[2]);
      A(d, d, d);
      Z(e, b, a);
      Z(f, d, c);
      A(g, d, c);
      A(h, b, a);

      M(p[0], e, f);
      M(p[1], h, g);
      M(p[2], g, f);
      M(p[3], e, h);
    }

    function cswap(p, q, b) {
      var i;
      for (i = 0; i < 4; i++) {
        sel25519(p[i], q[i], b);
      }
    }

    function pack(r, p) {
      var tx = gf(),
        ty = gf(),
        zi = gf();
      inv25519(zi, p[2]);
      M(tx, p[0], zi);
      M(ty, p[1], zi);
      pack25519(r, ty);
      r[31] ^= par25519(tx) << 7;
    }

    function scalarmult(p, q, s) {
      var b, i;
      set25519(p[0], gf0);
      set25519(p[1], gf1);
      set25519(p[2], gf1);
      set25519(p[3], gf0);
      for (i = 255; i >= 0; --i) {
        b = (s[(i / 8) | 0] >> (i & 7)) & 1;
        cswap(p, q, b);
        add(q, p);
        add(p, p);
        cswap(p, q, b);
      }
    }

    function scalarbase(p, s) {
      var q = [gf(), gf(), gf(), gf()];
      set25519(q[0], X);
      set25519(q[1], Y);
      set25519(q[2], gf1);
      M(q[3], X, Y);
      scalarmult(p, q, s);
    }

    function crypto_sign_keypair(pk, sk, seeded) {
      var d = new Uint8Array(64);
      var p = [gf(), gf(), gf(), gf()];
      var i;

      if (!seeded) randombytes(sk, 32);
      crypto_hash(d, sk, 32);
      d[0] &= 248;
      d[31] &= 127;
      d[31] |= 64;

      scalarbase(p, d);
      pack(pk, p);

      for (i = 0; i < 32; i++) sk[i + 32] = pk[i];
      return 0;
    }

    var L = new Float64Array([
      0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10
    ]);

    function modL(r, x) {
      var carry, i, j, k;
      for (i = 63; i >= 32; --i) {
        carry = 0;
        for (j = i - 32, k = i - 12; j < k; ++j) {
          x[j] += carry - 16 * x[i] * L[j - (i - 32)];
          carry = Math.floor((x[j] + 128) / 256);
          x[j] -= carry * 256;
        }
        x[j] += carry;
        x[i] = 0;
      }
      carry = 0;
      for (j = 0; j < 32; j++) {
        x[j] += carry - (x[31] >> 4) * L[j];
        carry = x[j] >> 8;
        x[j] &= 255;
      }
      for (j = 0; j < 32; j++) x[j] -= carry * L[j];
      for (i = 0; i < 32; i++) {
        x[i + 1] += x[i] >> 8;
        r[i] = x[i] & 255;
      }
    }

    function reduce(r) {
      var x = new Float64Array(64),
        i;
      for (i = 0; i < 64; i++) x[i] = r[i];
      for (i = 0; i < 64; i++) r[i] = 0;
      modL(r, x);
    }

    // Note: difference from C - smlen returned, not passed as argument.
    function crypto_sign(sm, m, n, sk) {
      var d = new Uint8Array(64),
        h = new Uint8Array(64),
        r = new Uint8Array(64);
      var i,
        j,
        x = new Float64Array(64);
      var p = [gf(), gf(), gf(), gf()];

      crypto_hash(d, sk, 32);
      d[0] &= 248;
      d[31] &= 127;
      d[31] |= 64;

      var smlen = n + 64;
      for (i = 0; i < n; i++) sm[64 + i] = m[i];
      for (i = 0; i < 32; i++) sm[32 + i] = d[32 + i];

      crypto_hash(r, sm.subarray(32), n + 32);
      reduce(r);
      scalarbase(p, r);
      pack(sm, p);

      for (i = 32; i < 64; i++) sm[i] = sk[i];
      crypto_hash(h, sm, n + 64);
      reduce(h);

      for (i = 0; i < 64; i++) x[i] = 0;
      for (i = 0; i < 32; i++) x[i] = r[i];
      for (i = 0; i < 32; i++) {
        for (j = 0; j < 32; j++) {
          x[i + j] += h[i] * d[j];
        }
      }

      modL(sm.subarray(32), x);
      return smlen;
    }

    function unpackneg(r, p) {
      var t = gf(),
        chk = gf(),
        num = gf(),
        den = gf(),
        den2 = gf(),
        den4 = gf(),
        den6 = gf();

      set25519(r[2], gf1);
      unpack25519(r[1], p);
      S(num, r[1]);
      M(den, num, D);
      Z(num, num, r[2]);
      A(den, r[2], den);

      S(den2, den);
      S(den4, den2);
      M(den6, den4, den2);
      M(t, den6, num);
      M(t, t, den);

      pow2523(t, t);
      M(t, t, num);
      M(t, t, den);
      M(t, t, den);
      M(r[0], t, den);

      S(chk, r[0]);
      M(chk, chk, den);
      if (neq25519(chk, num)) M(r[0], r[0], I);

      S(chk, r[0]);
      M(chk, chk, den);
      if (neq25519(chk, num)) return -1;

      if (par25519(r[0]) === p[31] >> 7) Z(r[0], gf0, r[0]);

      M(r[3], r[0], r[1]);
      return 0;
    }

    function crypto_sign_open(m, sm, n, pk) {
      var i;
      var t = new Uint8Array(32),
        h = new Uint8Array(64);
      var p = [gf(), gf(), gf(), gf()],
        q = [gf(), gf(), gf(), gf()];

      if (n < 64) return -1;

      if (unpackneg(q, pk)) return -1;

      for (i = 0; i < n; i++) m[i] = sm[i];
      for (i = 0; i < 32; i++) m[i + 32] = pk[i];
      crypto_hash(h, m, n);
      reduce(h);
      scalarmult(p, q, h);

      scalarbase(q, sm.subarray(32));
      add(p, q);
      pack(t, p);

      n -= 64;
      if (crypto_verify_32(sm, 0, t, 0)) {
        for (i = 0; i < n; i++) m[i] = 0;
        return -1;
      }

      for (i = 0; i < n; i++) m[i] = sm[i + 64];
      return n;
    }

    var crypto_secretbox_KEYBYTES = 32,
      crypto_secretbox_NONCEBYTES = 24,
      crypto_secretbox_ZEROBYTES = 32,
      crypto_secretbox_BOXZEROBYTES = 16,
      crypto_scalarmult_BYTES = 32,
      crypto_scalarmult_SCALARBYTES = 32,
      crypto_box_PUBLICKEYBYTES = 32,
      crypto_box_SECRETKEYBYTES = 32,
      crypto_box_BEFORENMBYTES = 32,
      crypto_box_NONCEBYTES = crypto_secretbox_NONCEBYTES,
      crypto_box_ZEROBYTES = crypto_secretbox_ZEROBYTES,
      crypto_box_BOXZEROBYTES = crypto_secretbox_BOXZEROBYTES,
      crypto_sign_BYTES = 64,
      crypto_sign_PUBLICKEYBYTES = 32,
      crypto_sign_SECRETKEYBYTES = 64,
      crypto_sign_SEEDBYTES = 32,
      crypto_hash_BYTES = 64;

    nacl.lowlevel = {
      crypto_core_hsalsa20: crypto_core_hsalsa20,
      crypto_stream_xor: crypto_stream_xor,
      crypto_stream: crypto_stream,
      crypto_stream_salsa20_xor: crypto_stream_salsa20_xor,
      crypto_stream_salsa20: crypto_stream_salsa20,
      crypto_onetimeauth: crypto_onetimeauth,
      crypto_onetimeauth_verify: crypto_onetimeauth_verify,
      crypto_verify_16: crypto_verify_16,
      crypto_verify_32: crypto_verify_32,
      crypto_secretbox: crypto_secretbox,
      crypto_secretbox_open: crypto_secretbox_open,
      crypto_scalarmult: crypto_scalarmult,
      crypto_scalarmult_base: crypto_scalarmult_base,
      crypto_box_beforenm: crypto_box_beforenm,
      crypto_box_afternm: crypto_box_afternm,
      crypto_box: crypto_box,
      crypto_box_open: crypto_box_open,
      crypto_box_keypair: crypto_box_keypair,
      crypto_hash: crypto_hash,
      crypto_sign: crypto_sign,
      crypto_sign_keypair: crypto_sign_keypair,
      crypto_sign_open: crypto_sign_open,

      crypto_secretbox_KEYBYTES: crypto_secretbox_KEYBYTES,
      crypto_secretbox_NONCEBYTES: crypto_secretbox_NONCEBYTES,
      crypto_secretbox_ZEROBYTES: crypto_secretbox_ZEROBYTES,
      crypto_secretbox_BOXZEROBYTES: crypto_secretbox_BOXZEROBYTES,
      crypto_scalarmult_BYTES: crypto_scalarmult_BYTES,
      crypto_scalarmult_SCALARBYTES: crypto_scalarmult_SCALARBYTES,
      crypto_box_PUBLICKEYBYTES: crypto_box_PUBLICKEYBYTES,
      crypto_box_SECRETKEYBYTES: crypto_box_SECRETKEYBYTES,
      crypto_box_BEFORENMBYTES: crypto_box_BEFORENMBYTES,
      crypto_box_NONCEBYTES: crypto_box_NONCEBYTES,
      crypto_box_ZEROBYTES: crypto_box_ZEROBYTES,
      crypto_box_BOXZEROBYTES: crypto_box_BOXZEROBYTES,
      crypto_sign_BYTES: crypto_sign_BYTES,
      crypto_sign_PUBLICKEYBYTES: crypto_sign_PUBLICKEYBYTES,
      crypto_sign_SECRETKEYBYTES: crypto_sign_SECRETKEYBYTES,
      crypto_sign_SEEDBYTES: crypto_sign_SEEDBYTES,
      crypto_hash_BYTES: crypto_hash_BYTES,

      gf: gf,
      D: D,
      L: L,
      pack25519: pack25519,
      unpack25519: unpack25519,
      M: M,
      A: A,
      S: S,
      Z: Z,
      pow2523: pow2523,
      add: add,
      set25519: set25519,
      modL: modL,
      scalarmult: scalarmult,
      scalarbase: scalarbase
    };

    /* High-level API */

    function checkLengths(k, n) {
      if (k.length !== crypto_secretbox_KEYBYTES) throw new Error('bad key size');
      if (n.length !== crypto_secretbox_NONCEBYTES) throw new Error('bad nonce size');
    }

    function checkBoxLengths(pk, sk) {
      if (pk.length !== crypto_box_PUBLICKEYBYTES) throw new Error('bad public key size');
      if (sk.length !== crypto_box_SECRETKEYBYTES) throw new Error('bad secret key size');
    }

    function checkArrayTypes() {
      for (var i = 0; i < arguments.length; i++) {
        if (!(arguments[i] instanceof Uint8Array)) throw new TypeError('unexpected type, use Uint8Array');
      }
    }

    function cleanup(arr) {
      for (var i = 0; i < arr.length; i++) arr[i] = 0;
    }

    nacl.randomBytes = function (n) {
      var b = new Uint8Array(n);
      randombytes(b, n);
      return b;
    };

    nacl.secretbox = function (msg, nonce, key) {
      checkArrayTypes(msg, nonce, key);
      checkLengths(key, nonce);
      var m = new Uint8Array(crypto_secretbox_ZEROBYTES + msg.length);
      var c = new Uint8Array(m.length);
      for (var i = 0; i < msg.length; i++) m[i + crypto_secretbox_ZEROBYTES] = msg[i];
      crypto_secretbox(c, m, m.length, nonce, key);
      return c.subarray(crypto_secretbox_BOXZEROBYTES);
    };

    nacl.secretbox.open = function (box, nonce, key) {
      checkArrayTypes(box, nonce, key);
      checkLengths(key, nonce);
      var c = new Uint8Array(crypto_secretbox_BOXZEROBYTES + box.length);
      var m = new Uint8Array(c.length);
      for (var i = 0; i < box.length; i++) c[i + crypto_secretbox_BOXZEROBYTES] = box[i];
      if (c.length < 32) return null;
      if (crypto_secretbox_open(m, c, c.length, nonce, key) !== 0) return null;
      return m.subarray(crypto_secretbox_ZEROBYTES);
    };

    nacl.secretbox.keyLength = crypto_secretbox_KEYBYTES;
    nacl.secretbox.nonceLength = crypto_secretbox_NONCEBYTES;
    nacl.secretbox.overheadLength = crypto_secretbox_BOXZEROBYTES;

    nacl.scalarMult = function (n, p) {
      checkArrayTypes(n, p);
      if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error('bad n size');
      if (p.length !== crypto_scalarmult_BYTES) throw new Error('bad p size');
      var q = new Uint8Array(crypto_scalarmult_BYTES);
      crypto_scalarmult(q, n, p);
      return q;
    };

    nacl.scalarMult.base = function (n) {
      checkArrayTypes(n);
      if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error('bad n size');
      var q = new Uint8Array(crypto_scalarmult_BYTES);
      crypto_scalarmult_base(q, n);
      return q;
    };

    nacl.scalarMult.scalarLength = crypto_scalarmult_SCALARBYTES;
    nacl.scalarMult.groupElementLength = crypto_scalarmult_BYTES;

    nacl.box = function (msg, nonce, publicKey, secretKey) {
      var k = nacl.box.before(publicKey, secretKey);
      return nacl.secretbox(msg, nonce, k);
    };

    nacl.box.before = function (publicKey, secretKey) {
      checkArrayTypes(publicKey, secretKey);
      checkBoxLengths(publicKey, secretKey);
      var k = new Uint8Array(crypto_box_BEFORENMBYTES);
      crypto_box_beforenm(k, publicKey, secretKey);
      return k;
    };

    nacl.box.after = nacl.secretbox;

    nacl.box.open = function (msg, nonce, publicKey, secretKey) {
      var k = nacl.box.before(publicKey, secretKey);
      return nacl.secretbox.open(msg, nonce, k);
    };

    nacl.box.open.after = nacl.secretbox.open;

    nacl.box.keyPair = function () {
      var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
      var sk = new Uint8Array(crypto_box_SECRETKEYBYTES);
      crypto_box_keypair(pk, sk);
      return { publicKey: pk, secretKey: sk };
    };

    nacl.box.keyPair.fromSecretKey = function (secretKey) {
      checkArrayTypes(secretKey);
      if (secretKey.length !== crypto_box_SECRETKEYBYTES) throw new Error('bad secret key size');
      var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
      crypto_scalarmult_base(pk, secretKey);
      return { publicKey: pk, secretKey: new Uint8Array(secretKey) };
    };

    nacl.box.publicKeyLength = crypto_box_PUBLICKEYBYTES;
    nacl.box.secretKeyLength = crypto_box_SECRETKEYBYTES;
    nacl.box.sharedKeyLength = crypto_box_BEFORENMBYTES;
    nacl.box.nonceLength = crypto_box_NONCEBYTES;
    nacl.box.overheadLength = nacl.secretbox.overheadLength;

    nacl.sign = function (msg, secretKey) {
      checkArrayTypes(msg, secretKey);
      if (secretKey.length !== crypto_sign_SECRETKEYBYTES) throw new Error('bad secret key size');
      var signedMsg = new Uint8Array(crypto_sign_BYTES + msg.length);
      crypto_sign(signedMsg, msg, msg.length, secretKey);
      return signedMsg;
    };

    nacl.sign.open = function (signedMsg, publicKey) {
      checkArrayTypes(signedMsg, publicKey);
      if (publicKey.length !== crypto_sign_PUBLICKEYBYTES) throw new Error('bad public key size');
      var tmp = new Uint8Array(signedMsg.length);
      var mlen = crypto_sign_open(tmp, signedMsg, signedMsg.length, publicKey);
      if (mlen < 0) return null;
      var m = new Uint8Array(mlen);
      for (var i = 0; i < m.length; i++) m[i] = tmp[i];
      return m;
    };

    nacl.sign.detached = function (msg, secretKey) {
      var signedMsg = nacl.sign(msg, secretKey);
      var sig = new Uint8Array(crypto_sign_BYTES);
      for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
      return sig;
    };

    nacl.sign.detached.verify = function (msg, sig, publicKey) {
      checkArrayTypes(msg, sig, publicKey);
      if (sig.length !== crypto_sign_BYTES) throw new Error('bad signature size');
      if (publicKey.length !== crypto_sign_PUBLICKEYBYTES) throw new Error('bad public key size');
      var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
      var m = new Uint8Array(crypto_sign_BYTES + msg.length);
      var i;
      for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
      for (i = 0; i < msg.length; i++) sm[i + crypto_sign_BYTES] = msg[i];
      return crypto_sign_open(m, sm, sm.length, publicKey) >= 0;
    };

    nacl.sign.keyPair = function () {
      var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
      var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
      crypto_sign_keypair(pk, sk);
      return { publicKey: pk, secretKey: sk };
    };

    nacl.sign.keyPair.fromSecretKey = function (secretKey) {
      checkArrayTypes(secretKey);
      if (secretKey.length !== crypto_sign_SECRETKEYBYTES) throw new Error('bad secret key size');
      var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
      for (var i = 0; i < pk.length; i++) pk[i] = secretKey[32 + i];
      return { publicKey: pk, secretKey: new Uint8Array(secretKey) };
    };

    nacl.sign.keyPair.fromSeed = function (seed) {
      checkArrayTypes(seed);
      if (seed.length !== crypto_sign_SEEDBYTES) throw new Error('bad seed size');
      var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
      var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
      for (var i = 0; i < 32; i++) sk[i] = seed[i];
      crypto_sign_keypair(pk, sk, true);
      return { publicKey: pk, secretKey: sk };
    };

    nacl.sign.publicKeyLength = crypto_sign_PUBLICKEYBYTES;
    nacl.sign.secretKeyLength = crypto_sign_SECRETKEYBYTES;
    nacl.sign.seedLength = crypto_sign_SEEDBYTES;
    nacl.sign.signatureLength = crypto_sign_BYTES;

    nacl.hash = function (msg) {
      checkArrayTypes(msg);
      var h = new Uint8Array(crypto_hash_BYTES);
      crypto_hash(h, msg, msg.length);
      return h;
    };

    nacl.hash.hashLength = crypto_hash_BYTES;

    nacl.verify = function (x, y) {
      checkArrayTypes(x, y);
      // Zero length arguments are considered not equal.
      if (x.length === 0 || y.length === 0) return false;
      if (x.length !== y.length) return false;
      return vn(x, 0, y, 0, x.length) === 0 ? true : false;
    };

    nacl.setPRNG = function (fn) {
      randombytes = fn;
    };

    (function () {
      // Initialize PRNG if environment provides CSPRNG.
      // If not, methods calling randombytes will throw.
      var crypto = typeof self !== 'undefined' ? self.crypto || self.msCrypto : null;
      if (crypto && crypto.getRandomValues) {
        // Browsers.
        var QUOTA = 65536;
        nacl.setPRNG(function (x, n) {
          var i,
            v = new Uint8Array(n);
          for (i = 0; i < n; i += QUOTA) {
            crypto.getRandomValues(v.subarray(i, i + Math.min(n - i, QUOTA)));
          }
          for (i = 0; i < n; i++) x[i] = v[i];
          cleanup(v);
        });
      } else if (typeof commonjsRequire !== 'undefined') {
        // Node.js.
        crypto = require$$0;
        if (crypto && crypto.randomBytes) {
          nacl.setPRNG(function (x, n) {
            var i,
              v = crypto.randomBytes(n);
            for (i = 0; i < n; i++) x[i] = v[i];
            cleanup(v);
          });
        }
      }
    })();
  })(module.exports ? module.exports : (self.nacl = self.nacl || {}));
});

var utf8 = createCommonjsModule(function (module, exports) {
  // Copyright (C) 2016 Dmitry Chestnykh
  // MIT License. See LICENSE file for details.
  Object.defineProperty(exports, '__esModule', { value: true });
  /**
   * Package utf8 implements UTF-8 encoding and decoding.
   */
  var INVALID_UTF16 = 'utf8: invalid string';
  var INVALID_UTF8 = 'utf8: invalid source encoding';
  /**
   * Encodes the given string into UTF-8 byte array.
   * Throws if the source string has invalid UTF-16 encoding.
   */
  function encode(s) {
    // Calculate result length and allocate output array.
    // encodedLength() also validates string and throws errors,
    // so we don't need repeat validation here.
    var arr = new Uint8Array(encodedLength(s));
    var pos = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) {
        arr[pos++] = c;
      } else if (c < 0x800) {
        arr[pos++] = 0xc0 | (c >> 6);
        arr[pos++] = 0x80 | (c & 0x3f);
      } else if (c < 0xd800) {
        arr[pos++] = 0xe0 | (c >> 12);
        arr[pos++] = 0x80 | ((c >> 6) & 0x3f);
        arr[pos++] = 0x80 | (c & 0x3f);
      } else {
        i++; // get one more character
        c = (c & 0x3ff) << 10;
        c |= s.charCodeAt(i) & 0x3ff;
        c += 0x10000;
        arr[pos++] = 0xf0 | (c >> 18);
        arr[pos++] = 0x80 | ((c >> 12) & 0x3f);
        arr[pos++] = 0x80 | ((c >> 6) & 0x3f);
        arr[pos++] = 0x80 | (c & 0x3f);
      }
    }
    return arr;
  }
  exports.encode = encode;
  /**
   * Returns the number of bytes required to encode the given string into UTF-8.
   * Throws if the source string has invalid UTF-16 encoding.
   */
  function encodedLength(s) {
    var result = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) {
        result += 1;
      } else if (c < 0x800) {
        result += 2;
      } else if (c < 0xd800) {
        result += 3;
      } else if (c <= 0xdfff) {
        if (i >= s.length - 1) {
          throw new Error(INVALID_UTF16);
        }
        i++; // "eat" next character
        result += 4;
      } else {
        throw new Error(INVALID_UTF16);
      }
    }
    return result;
  }
  exports.encodedLength = encodedLength;
  /**
   * Decodes the given byte array from UTF-8 into a string.
   * Throws if encoding is invalid.
   */
  function decode(arr) {
    var chars = [];
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      if (b & 0x80) {
        var min = void 0;
        if (b < 0xe0) {
          // Need 1 more byte.
          if (i >= arr.length) {
            throw new Error(INVALID_UTF8);
          }
          var n1 = arr[++i];
          if ((n1 & 0xc0) !== 0x80) {
            throw new Error(INVALID_UTF8);
          }
          b = ((b & 0x1f) << 6) | (n1 & 0x3f);
          min = 0x80;
        } else if (b < 0xf0) {
          // Need 2 more bytes.
          if (i >= arr.length - 1) {
            throw new Error(INVALID_UTF8);
          }
          var n1 = arr[++i];
          var n2 = arr[++i];
          if ((n1 & 0xc0) !== 0x80 || (n2 & 0xc0) !== 0x80) {
            throw new Error(INVALID_UTF8);
          }
          b = ((b & 0x0f) << 12) | ((n1 & 0x3f) << 6) | (n2 & 0x3f);
          min = 0x800;
        } else if (b < 0xf8) {
          // Need 3 more bytes.
          if (i >= arr.length - 2) {
            throw new Error(INVALID_UTF8);
          }
          var n1 = arr[++i];
          var n2 = arr[++i];
          var n3 = arr[++i];
          if ((n1 & 0xc0) !== 0x80 || (n2 & 0xc0) !== 0x80 || (n3 & 0xc0) !== 0x80) {
            throw new Error(INVALID_UTF8);
          }
          b = ((b & 0x0f) << 18) | ((n1 & 0x3f) << 12) | ((n2 & 0x3f) << 6) | (n3 & 0x3f);
          min = 0x10000;
        } else {
          throw new Error(INVALID_UTF8);
        }
        if (b < min || (b >= 0xd800 && b <= 0xdfff)) {
          throw new Error(INVALID_UTF8);
        }
        if (b >= 0x10000) {
          // Surrogate pair.
          if (b > 0x10ffff) {
            throw new Error(INVALID_UTF8);
          }
          b -= 0x10000;
          chars.push(String.fromCharCode(0xd800 | (b >> 10)));
          b = 0xdc00 | (b & 0x3ff);
        }
      }
      chars.push(String.fromCharCode(b));
    }
    return chars.join('');
  }
  exports.decode = decode;
});

var lib = createCommonjsModule(function (module, exports) {
  function r(r) {
    return r && 'object' == typeof r && 'default' in r ? r.default : r;
  }
  var e = elliptic_1,
    t = sha256$1,
    n = sha3,
    i = r(uportBase64url),
    a = r(naclFast),
    u = utf8;
  function c(r) {
    return buffer.Buffer.from(t.sha256.arrayBuffer(r));
  }
  function f(r) {
    return (
      '0x' +
      ((e = buffer.Buffer.from(r.slice(2), 'hex')), buffer.Buffer.from(n.keccak_256.arrayBuffer(e)))
        .slice(-20)
        .toString('hex')
    );
    var e;
  }
  var s = new e.ec('secp256k1');
  function l(r, e) {
    return void 0 === e && (e = 64), r.length === e ? r : '0'.repeat(e - r.length) + r;
  }
  function h(r) {
    r.startsWith('0x') && (r = r.substring(2));
    var e = s.keyFromPrivate(r);
    return function (r) {
      try {
        var t = e.sign(c(r)),
          n = t.s,
          o = t.recoveryParam;
        return Promise.resolve({ r: l(t.r.toString('hex')), s: l(n.toString('hex')), recoveryParam: o });
      } catch (r) {
        return Promise.reject(r);
      }
    };
  }
  function d(r) {
    return new Uint8Array(Array.prototype.slice.call(buffer.Buffer.from(r, 'base64'), 0));
  }
  function v(r, e) {
    var t = r.r,
      n = r.s,
      o = r.recoveryParam,
      a = buffer.Buffer.alloc(e ? 65 : 64);
    if ((buffer.Buffer.from(t, 'hex').copy(a, 0), buffer.Buffer.from(n, 'hex').copy(a, 32), e)) {
      if (void 0 === o) throw new Error('Signer did not return a recoveryParam');
      a[64] = o;
    }
    return i.encode(a);
  }
  function p() {
    return (p =
      Object.assign ||
      function (r) {
        for (var e = 1; e < arguments.length; e++) {
          var t = arguments[e];
          for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && (r[n] = t[n]);
        }
        return r;
      }).apply(this, arguments);
  }
  var y = new e.ec('secp256k1');
  function g(r, e) {
    void 0 === e && (e = !1);
    var t = i.toBuffer(r);
    if (t.length !== (e ? 65 : 64)) throw new Error('wrong signature length');
    var n = { r: t.slice(0, 32).toString('hex'), s: t.slice(32, 64).toString('hex') };
    return e && (n.recoveryParam = t[64]), n;
  }
  function w(r, e, t) {
    var n;
    if (e.length > 86) n = [g(e, !0)];
    else {
      var o = g(e, !1);
      n = [p({}, o, { recoveryParam: 0 }), p({}, o, { recoveryParam: 1 })];
    }
    var i = n
      .map(function (e) {
        var n = c(r),
          o = y.recoverPubKey(n, e, e.recoveryParam),
          i = o.encode('hex'),
          a = o.encode('hex', !0),
          u = f(i);
        return t.find(function (r) {
          var e = r.publicKeyHex;
          return e === i || e === a || r.ethereumAddress === u;
        });
      })
      .filter(function (r) {
        return null != r;
      });
    if (0 === i.length) throw new Error('Signature invalid for JWT');
    return i[0];
  }
  var m = {
    ES256K: function (r, e, t) {
      var n = c(r),
        o = g(e),
        i = t.filter(function (r) {
          return void 0 !== r.publicKeyHex;
        }),
        a = t.filter(function (r) {
          return void 0 !== r.ethereumAddress;
        }),
        u = i.find(function (r) {
          var e = r.publicKeyHex;
          try {
            return y.keyFromPublic(e, 'hex').verify(n, o);
          } catch (r) {
            return !1;
          }
        });
      if ((!u && a.length > 0 && (u = w(r, e, a)), !u)) throw new Error('Signature invalid for JWT');
      return u;
    },
    'ES256K-R': w,
    Ed25519: function (r, e, t) {
      var n = u.encode(r),
        o = d(i.toBase64(e)),
        c = t.find(function (r) {
          return a.sign.detached.verify(n, o, d(r.publicKeyBase64));
        });
      if (!c) throw new Error('Signature invalid for JWT');
      return c;
    }
  };
  function b(r) {
    var e = m[r];
    if (!e) throw new Error('Unsupported algorithm ' + r);
    return e;
  }
  function E(r) {
    return 'object' == typeof r && 'r' in r && 's' in r;
  }
  function S(r) {
    return function (e, t) {
      try {
        return Promise.resolve(t(e)).then(function (e) {
          if (E(e)) return v(e, r);
          if (r) throw new Error('ES256K-R not supported when signer function returns string');
          return e;
        });
      } catch (r) {
        return Promise.reject(r);
      }
    };
  }
  b.toSignatureObject = g;
  var x = {
      ES256K: S(),
      'ES256K-R': S(!0),
      Ed25519: function (r, e) {
        try {
          return Promise.resolve(e(r)).then(function (r) {
            if (E(r)) throw new Error('expected a signer function that returns a string instead of signature object');
            return r;
          });
        } catch (r) {
          return Promise.reject(r);
        }
      }
    },
    P = function (r, e, t) {
      void 0 === t && (t = {});
      try {
        t.alg || (t.alg = K);
        var n = [j(t), j(r)].join('.'),
          o = (function (r) {
            var e = x[r];
            if (!e) throw new Error('Unsupported algorithm ' + r);
            return e;
          })(t.alg);
        return Promise.resolve(o(n, e)).then(function (r) {
          return [n, r].join('.');
        });
      } catch (r) {
        return Promise.reject(r);
      }
    },
    J = {
      ES256K: ['Secp256k1VerificationKey2018', 'Secp256k1SignatureVerificationKey2018', 'EcdsaPublicKeySecp256k1'],
      'ES256K-R': ['Secp256k1VerificationKey2018', 'Secp256k1SignatureVerificationKey2018', 'EcdsaPublicKeySecp256k1'],
      Ed25519: ['ED25519SignatureVerification']
    },
    K = 'ES256K';
  function j(r) {
    return i.encode(JSON.stringify(r));
  }
  function W(r) {
    if (!r) throw new Error('no JWT passed into decodeJWT');
    var e = r.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/);
    if (e)
      return {
        header: JSON.parse(i.decode(e[1])),
        payload: JSON.parse(i.decode(e[2])),
        signature: e[3],
        data: e[1] + '.' + e[2]
      };
    throw new Error('Incorrect format JWT');
  }
  function k(r, e) {
    var t = r.header,
      n = r.data,
      o = r.signature;
    return Array.isArray(e) || (e = [e]), b(t.alg)(n, o, e);
  }
  (exports.EllipticSigner = function (r) {
    var e = h(r);
    return function (r) {
      try {
        return Promise.resolve(e(r)).then(function (r) {
          return v(r);
        });
      } catch (r) {
        return Promise.reject(r);
      }
    };
  }),
    (exports.NaclSigner = function (r) {
      var e = d(r);
      return function (r) {
        try {
          var t = u.encode(r),
            n = a.sign.detached(t, e),
            c = i.encode(buffer.Buffer.from(n));
          return Promise.resolve(c);
        } catch (r) {
          return Promise.reject(r);
        }
      };
    }),
    (exports.SimpleSigner = h),
    (exports.createJWS = P),
    (exports.decodeJWT = W),
    (exports.toEthereumAddress = f),
    (exports.verifyJWS = function (r, e) {
      return k(W(r), e);
    })
});


function e() {
  var r = new Map();
  return function (e, t) {
    try {
      var n,
        o = function (o) {
          if (n) return o;
          var i = r.get(e.did);
          return void 0 !== i
            ? i
            : Promise.resolve(t()).then(function (t) {
                return null !== t && r.set(e.did, t), t;
              });
        },
        i = (function () {
          if (e.params && 'true' === e.params['no-cache']) return (n = 1), Promise.resolve(t());
        })();
      return Promise.resolve(i && i.then ? i.then(o) : o(i));
    } catch (r) {
      return Promise.reject(r);
    }
  };
}
function t(r, e) {
  return e();
}
var n = new RegExp(
  '^did:([a-zA-Z0-9_]+):([a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)*)((;[a-zA-Z0-9_.:%-]+=[a-zA-Z0-9_.:%-]*)*)(/[^#?]*)?([?][^#]*)?(#.*)?$'
);
function o(e) {
  if ('' === e || !e) throw new Error('Missing DID');
  var t = e.match(n);
  if (t) {
    var o = { did: 'did:' + t[1] + ':' + t[2], method: t[1], id: t[2], didUrl: e };
    if (t[4]) {
      var i = t[4].slice(1).split(';');
      o.params = {};
      for (
        var a,
          u = (function (e, t) {
            var n;
            if ('undefined' == typeof Symbol || null == e[Symbol.iterator]) {
              if (
                Array.isArray(e) ||
                (n = (function (e, t) {
                  if (e) {
                    if ('string' == typeof e) return r$2(e, void 0);
                    var n = Object.prototype.toString.call(e).slice(8, -1);
                    return (
                      'Object' === n && e.constructor && (n = e.constructor.name),
                      'Map' === n || 'Set' === n
                        ? Array.from(e)
                        : 'Arguments' === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)
                        ? r$2(e, void 0)
                        : void 0
                    );
                  }
                })(e))
              ) {
                n && (e = n);
                var o = 0;
                return function () {
                  return o >= e.length ? { done: !0 } : { done: !1, value: e[o++] };
                };
              }
              throw new TypeError(
                'Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
              );
            }
            return (n = e[Symbol.iterator]()).next.bind(n);
          })(i);
        !(a = u()).done;

      ) {
        var c = a.value.split('=');
        o.params[c[0]] = c[1];
      }
    }
    return t[6] && (o.path = t[6]), t[7] && (o.query = t[7].slice(1)), t[8] && (o.fragment = t[8].slice(1)), o;
  }
  throw new Error('Invalid DID ' + e);
}
var i$1 = (function () {
  function r(r, n) {
    void 0 === r && (r = {}), (this.registry = r), (this.cache = !0 === n ? e() : n || t);
  }
  return (
    (r.prototype.resolve = function (r) {
      try {
        var e,
          t = function (r) {
            if (e) return r;
            throw new Error("Unsupported DID method: '" + i.method + "'");
          },
          n = this,
          i = o(r),
          a = n.registry[i.method],
          u = (function () {
            if (a)
              return Promise.resolve(
                n.cache(i, function () {
                  return a(i.did, i, n);
                })
              ).then(function (r) {
                if (null == r) throw new Error('resolver returned null for ' + i.did);
                return (e = 1), r;
              });
          })();
        return Promise.resolve(u && u.then ? u.then(t) : t(u));
      } catch (r) {
        return Promise.reject(r);
      }
    }),
    r
  );
})();

var interopRequireDefault = createCommonjsModule(function (module) {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule
      ? obj
      : {
          default: obj
        };
  }

  module.exports = _interopRequireDefault;
});

var runtime_1 = createCommonjsModule(function (module) {
  /**
   * Copyright (c) 2014-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  var runtime = (function (exports) {
    var Op = Object.prototype;
    var hasOwn = Op.hasOwnProperty;
    var undefined$1; // More compressible than void 0.
    var $Symbol = typeof Symbol === 'function' ? Symbol : {};
    var iteratorSymbol = $Symbol.iterator || '@@iterator';
    var asyncIteratorSymbol = $Symbol.asyncIterator || '@@asyncIterator';
    var toStringTagSymbol = $Symbol.toStringTag || '@@toStringTag';

    function wrap(innerFn, outerFn, self, tryLocsList) {
      // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
      var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
      var generator = Object.create(protoGenerator.prototype);
      var context = new Context(tryLocsList || []);

      // The ._invoke method unifies the implementations of the .next,
      // .throw, and .return methods.
      generator._invoke = makeInvokeMethod(innerFn, self, context);

      return generator;
    }
    exports.wrap = wrap;

    // Try/catch helper to minimize deoptimizations. Returns a completion
    // record like context.tryEntries[i].completion. This interface could
    // have been (and was previously) designed to take a closure to be
    // invoked without arguments, but in all the cases we care about we
    // already have an existing method we want to call, so there's no need
    // to create a new function object. We can even get away with assuming
    // the method takes exactly one argument, since that happens to be true
    // in every case, so we don't have to touch the arguments object. The
    // only additional allocation required is the completion record, which
    // has a stable shape and so hopefully should be cheap to allocate.
    function tryCatch(fn, obj, arg) {
      try {
        return { type: 'normal', arg: fn.call(obj, arg) };
      } catch (err) {
        return { type: 'throw', arg: err };
      }
    }

    var GenStateSuspendedStart = 'suspendedStart';
    var GenStateSuspendedYield = 'suspendedYield';
    var GenStateExecuting = 'executing';
    var GenStateCompleted = 'completed';

    // Returning this object from the innerFn has the same effect as
    // breaking out of the dispatch switch statement.
    var ContinueSentinel = {};

    // Dummy constructor functions that we use as the .constructor and
    // .constructor.prototype properties for functions that return Generator
    // objects. For full spec compliance, you may wish to configure your
    // minifier not to mangle the names of these two functions.
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}

    // This is a polyfill for %IteratorPrototype% for environments that
    // don't natively support it.
    var IteratorPrototype = {};
    IteratorPrototype[iteratorSymbol] = function () {
      return this;
    };

    var getProto = Object.getPrototypeOf;
    var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
    if (
      NativeIteratorPrototype &&
      NativeIteratorPrototype !== Op &&
      hasOwn.call(NativeIteratorPrototype, iteratorSymbol)
    ) {
      // This environment has a native %IteratorPrototype%; use it instead
      // of the polyfill.
      IteratorPrototype = NativeIteratorPrototype;
    }

    var Gp = (GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype));
    GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
    GeneratorFunctionPrototype.constructor = GeneratorFunction;
    GeneratorFunctionPrototype[toStringTagSymbol] = GeneratorFunction.displayName = 'GeneratorFunction';

    // Helper for defining the .next, .throw, and .return methods of the
    // Iterator interface in terms of a single ._invoke method.
    function defineIteratorMethods(prototype) {
      ['next', 'throw', 'return'].forEach(function (method) {
        prototype[method] = function (arg) {
          return this._invoke(method, arg);
        };
      });
    }

    exports.isGeneratorFunction = function (genFun) {
      var ctor = typeof genFun === 'function' && genFun.constructor;
      return ctor
        ? ctor === GeneratorFunction ||
            // For the native GeneratorFunction constructor, the best we can
            // do is to check its .name property.
            (ctor.displayName || ctor.name) === 'GeneratorFunction'
        : false;
    };

    exports.mark = function (genFun) {
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
      } else {
        genFun.__proto__ = GeneratorFunctionPrototype;
        if (!(toStringTagSymbol in genFun)) {
          genFun[toStringTagSymbol] = 'GeneratorFunction';
        }
      }
      genFun.prototype = Object.create(Gp);
      return genFun;
    };

    // Within the body of any async function, `await x` is transformed to
    // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
    // `hasOwn.call(value, "__await")` to determine if the yielded value is
    // meant to be awaited.
    exports.awrap = function (arg) {
      return { __await: arg };
    };

    function AsyncIterator(generator, PromiseImpl) {
      function invoke(method, arg, resolve, reject) {
        var record = tryCatch(generator[method], generator, arg);
        if (record.type === 'throw') {
          reject(record.arg);
        } else {
          var result = record.arg;
          var value = result.value;
          if (value && typeof value === 'object' && hasOwn.call(value, '__await')) {
            return PromiseImpl.resolve(value.__await).then(
              function (value) {
                invoke('next', value, resolve, reject);
              },
              function (err) {
                invoke('throw', err, resolve, reject);
              }
            );
          }

          return PromiseImpl.resolve(value).then(
            function (unwrapped) {
              // When a yielded Promise is resolved, its final value becomes
              // the .value of the Promise<{value,done}> result for the
              // current iteration.
              result.value = unwrapped;
              resolve(result);
            },
            function (error) {
              // If a rejected Promise was yielded, throw the rejection back
              // into the async generator function so it can be handled there.
              return invoke('throw', error, resolve, reject);
            }
          );
        }
      }

      var previousPromise;

      function enqueue(method, arg) {
        function callInvokeWithMethodAndArg() {
          return new PromiseImpl(function (resolve, reject) {
            invoke(method, arg, resolve, reject);
          });
        }

        return (previousPromise =
          // If enqueue has been called before, then we want to wait until
          // all previous Promises have been resolved before calling invoke,
          // so that results are always delivered in the correct order. If
          // enqueue has not been called before, then it is important to
          // call invoke immediately, without waiting on a callback to fire,
          // so that the async generator function has the opportunity to do
          // any necessary setup in a predictable way. This predictability
          // is why the Promise constructor synchronously invokes its
          // executor callback, and why async functions synchronously
          // execute code before the first await. Since we implement simple
          // async functions in terms of async generators, it is especially
          // important to get this right, even though it requires care.
          previousPromise
            ? previousPromise.then(
                callInvokeWithMethodAndArg,
                // Avoid propagating failures to Promises returned by later
                // invocations of the iterator.
                callInvokeWithMethodAndArg
              )
            : callInvokeWithMethodAndArg());
      }

      // Define the unified helper method that is used to implement .next,
      // .throw, and .return (see defineIteratorMethods).
      this._invoke = enqueue;
    }

    defineIteratorMethods(AsyncIterator.prototype);
    AsyncIterator.prototype[asyncIteratorSymbol] = function () {
      return this;
    };
    exports.AsyncIterator = AsyncIterator;

    // Note that simple async functions are implemented on top of
    // AsyncIterator objects; they just return a Promise for the value of
    // the final result produced by the iterator.
    exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) {
      if (PromiseImpl === void 0) PromiseImpl = Promise;

      var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl);

      return exports.isGeneratorFunction(outerFn)
        ? iter // If outerFn is a generator, return the full iterator.
        : iter.next().then(function (result) {
            return result.done ? result.value : iter.next();
          });
    };

    function makeInvokeMethod(innerFn, self, context) {
      var state = GenStateSuspendedStart;

      return function invoke(method, arg) {
        if (state === GenStateExecuting) {
          throw new Error('Generator is already running');
        }

        if (state === GenStateCompleted) {
          if (method === 'throw') {
            throw arg;
          }

          // Be forgiving, per 25.3.3.3.3 of the spec:
          // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
          return doneResult();
        }

        context.method = method;
        context.arg = arg;

        while (true) {
          var delegate = context.delegate;
          if (delegate) {
            var delegateResult = maybeInvokeDelegate(delegate, context);
            if (delegateResult) {
              if (delegateResult === ContinueSentinel) continue;
              return delegateResult;
            }
          }

          if (context.method === 'next') {
            // Setting context._sent for legacy support of Babel's
            // function.sent implementation.
            context.sent = context._sent = context.arg;
          } else if (context.method === 'throw') {
            if (state === GenStateSuspendedStart) {
              state = GenStateCompleted;
              throw context.arg;
            }

            context.dispatchException(context.arg);
          } else if (context.method === 'return') {
            context.abrupt('return', context.arg);
          }

          state = GenStateExecuting;

          var record = tryCatch(innerFn, self, context);
          if (record.type === 'normal') {
            // If an exception is thrown from innerFn, we leave state ===
            // GenStateExecuting and loop back for another invocation.
            state = context.done ? GenStateCompleted : GenStateSuspendedYield;

            if (record.arg === ContinueSentinel) {
              continue;
            }

            return {
              value: record.arg,
              done: context.done
            };
          } else if (record.type === 'throw') {
            state = GenStateCompleted;
            // Dispatch the exception by looping back around to the
            // context.dispatchException(context.arg) call above.
            context.method = 'throw';
            context.arg = record.arg;
          }
        }
      };
    }

    // Call delegate.iterator[context.method](context.arg) and handle the
    // result, either by returning a { value, done } result from the
    // delegate iterator, or by modifying context.method and context.arg,
    // setting context.delegate to null, and returning the ContinueSentinel.
    function maybeInvokeDelegate(delegate, context) {
      var method = delegate.iterator[context.method];
      if (method === undefined$1) {
        // A .throw or .return when the delegate iterator has no .throw
        // method always terminates the yield* loop.
        context.delegate = null;

        if (context.method === 'throw') {
          // Note: ["return"] must be used for ES3 parsing compatibility.
          if (delegate.iterator['return']) {
            // If the delegate iterator has a return method, give it a
            // chance to clean up.
            context.method = 'return';
            context.arg = undefined$1;
            maybeInvokeDelegate(delegate, context);

            if (context.method === 'throw') {
              // If maybeInvokeDelegate(context) changed context.method from
              // "return" to "throw", let that override the TypeError below.
              return ContinueSentinel;
            }
          }

          context.method = 'throw';
          context.arg = new TypeError("The iterator does not provide a 'throw' method");
        }

        return ContinueSentinel;
      }

      var record = tryCatch(method, delegate.iterator, context.arg);

      if (record.type === 'throw') {
        context.method = 'throw';
        context.arg = record.arg;
        context.delegate = null;
        return ContinueSentinel;
      }

      var info = record.arg;

      if (!info) {
        context.method = 'throw';
        context.arg = new TypeError('iterator result is not an object');
        context.delegate = null;
        return ContinueSentinel;
      }

      if (info.done) {
        // Assign the result of the finished delegate to the temporary
        // variable specified by delegate.resultName (see delegateYield).
        context[delegate.resultName] = info.value;

        // Resume execution at the desired location (see delegateYield).
        context.next = delegate.nextLoc;

        // If context.method was "throw" but the delegate handled the
        // exception, let the outer generator proceed normally. If
        // context.method was "next", forget context.arg since it has been
        // "consumed" by the delegate iterator. If context.method was
        // "return", allow the original .return call to continue in the
        // outer generator.
        if (context.method !== 'return') {
          context.method = 'next';
          context.arg = undefined$1;
        }
      } else {
        // Re-yield the result returned by the delegate method.
        return info;
      }

      // The delegate iterator is finished, so forget it and continue with
      // the outer generator.
      context.delegate = null;
      return ContinueSentinel;
    }

    // Define Generator.prototype.{next,throw,return} in terms of the
    // unified ._invoke helper method.
    defineIteratorMethods(Gp);

    Gp[toStringTagSymbol] = 'Generator';

    // A Generator should always return itself as the iterator object when the
    // @@iterator function is called on it. Some browsers' implementations of the
    // iterator prototype chain incorrectly implement this, causing the Generator
    // object to not be returned from this call. This ensures that doesn't happen.
    // See https://github.com/facebook/regenerator/issues/274 for more details.
    Gp[iteratorSymbol] = function () {
      return this;
    };

    Gp.toString = function () {
      return '[object Generator]';
    };

    function pushTryEntry(locs) {
      var entry = { tryLoc: locs[0] };

      if (1 in locs) {
        entry.catchLoc = locs[1];
      }

      if (2 in locs) {
        entry.finallyLoc = locs[2];
        entry.afterLoc = locs[3];
      }

      this.tryEntries.push(entry);
    }

    function resetTryEntry(entry) {
      var record = entry.completion || {};
      record.type = 'normal';
      delete record.arg;
      entry.completion = record;
    }

    function Context(tryLocsList) {
      // The root entry object (effectively a try statement without a catch
      // or a finally block) gives us a place to store values thrown from
      // locations where there is no enclosing try statement.
      this.tryEntries = [{ tryLoc: 'root' }];
      tryLocsList.forEach(pushTryEntry, this);
      this.reset(true);
    }

    exports.keys = function (object) {
      var keys = [];
      for (var key in object) {
        keys.push(key);
      }
      keys.reverse();

      // Rather than returning an object with a next method, we keep
      // things simple and return the next function itself.
      return function next() {
        while (keys.length) {
          var key = keys.pop();
          if (key in object) {
            next.value = key;
            next.done = false;
            return next;
          }
        }

        // To avoid creating an additional object, we just hang the .value
        // and .done properties off the next function object itself. This
        // also ensures that the minifier will not anonymize the function.
        next.done = true;
        return next;
      };
    };

    function values(iterable) {
      if (iterable) {
        var iteratorMethod = iterable[iteratorSymbol];
        if (iteratorMethod) {
          return iteratorMethod.call(iterable);
        }

        if (typeof iterable.next === 'function') {
          return iterable;
        }

        if (!isNaN(iterable.length)) {
          var i = -1,
            next = function next() {
              while (++i < iterable.length) {
                if (hasOwn.call(iterable, i)) {
                  next.value = iterable[i];
                  next.done = false;
                  return next;
                }
              }

              next.value = undefined$1;
              next.done = true;

              return next;
            };

          return (next.next = next);
        }
      }

      // Return an iterator with no values.
      return { next: doneResult };
    }
    exports.values = values;

    function doneResult() {
      return { value: undefined$1, done: true };
    }

    Context.prototype = {
      constructor: Context,

      reset: function (skipTempReset) {
        this.prev = 0;
        this.next = 0;
        // Resetting context._sent for legacy support of Babel's
        // function.sent implementation.
        this.sent = this._sent = undefined$1;
        this.done = false;
        this.delegate = null;

        this.method = 'next';
        this.arg = undefined$1;

        this.tryEntries.forEach(resetTryEntry);

        if (!skipTempReset) {
          for (var name in this) {
            // Not sure about the optimal order of these conditions:
            if (name.charAt(0) === 't' && hasOwn.call(this, name) && !isNaN(+name.slice(1))) {
              this[name] = undefined$1;
            }
          }
        }
      },

      stop: function () {
        this.done = true;

        var rootEntry = this.tryEntries[0];
        var rootRecord = rootEntry.completion;
        if (rootRecord.type === 'throw') {
          throw rootRecord.arg;
        }

        return this.rval;
      },

      dispatchException: function (exception) {
        if (this.done) {
          throw exception;
        }

        var context = this;
        function handle(loc, caught) {
          record.type = 'throw';
          record.arg = exception;
          context.next = loc;

          if (caught) {
            // If the dispatched exception was caught by a catch block,
            // then let that catch block handle the exception normally.
            context.method = 'next';
            context.arg = undefined$1;
          }

          return !!caught;
        }

        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          var record = entry.completion;

          if (entry.tryLoc === 'root') {
            // Exception thrown outside of any try block that could handle
            // it, so set the completion value of the entire function to
            // throw the exception.
            return handle('end');
          }

          if (entry.tryLoc <= this.prev) {
            var hasCatch = hasOwn.call(entry, 'catchLoc');
            var hasFinally = hasOwn.call(entry, 'finallyLoc');

            if (hasCatch && hasFinally) {
              if (this.prev < entry.catchLoc) {
                return handle(entry.catchLoc, true);
              } else if (this.prev < entry.finallyLoc) {
                return handle(entry.finallyLoc);
              }
            } else if (hasCatch) {
              if (this.prev < entry.catchLoc) {
                return handle(entry.catchLoc, true);
              }
            } else if (hasFinally) {
              if (this.prev < entry.finallyLoc) {
                return handle(entry.finallyLoc);
              }
            } else {
              throw new Error('try statement without catch or finally');
            }
          }
        }
      },

      abrupt: function (type, arg) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc <= this.prev && hasOwn.call(entry, 'finallyLoc') && this.prev < entry.finallyLoc) {
            var finallyEntry = entry;
            break;
          }
        }

        if (
          finallyEntry &&
          (type === 'break' || type === 'continue') &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc
        ) {
          // Ignore the finally entry if control is not jumping to a
          // location outside the try/catch block.
          finallyEntry = null;
        }

        var record = finallyEntry ? finallyEntry.completion : {};
        record.type = type;
        record.arg = arg;

        if (finallyEntry) {
          this.method = 'next';
          this.next = finallyEntry.finallyLoc;
          return ContinueSentinel;
        }

        return this.complete(record);
      },

      complete: function (record, afterLoc) {
        if (record.type === 'throw') {
          throw record.arg;
        }

        if (record.type === 'break' || record.type === 'continue') {
          this.next = record.arg;
        } else if (record.type === 'return') {
          this.rval = this.arg = record.arg;
          this.method = 'return';
          this.next = 'end';
        } else if (record.type === 'normal' && afterLoc) {
          this.next = afterLoc;
        }

        return ContinueSentinel;
      },

      finish: function (finallyLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.finallyLoc === finallyLoc) {
            this.complete(entry.completion, entry.afterLoc);
            resetTryEntry(entry);
            return ContinueSentinel;
          }
        }
      },

      catch: function (tryLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc === tryLoc) {
            var record = entry.completion;
            if (record.type === 'throw') {
              var thrown = record.arg;
              resetTryEntry(entry);
            }
            return thrown;
          }
        }

        // The context.catch method must only be called with a location
        // argument that corresponds to a known catch block.
        throw new Error('illegal catch attempt');
      },

      delegateYield: function (iterable, resultName, nextLoc) {
        this.delegate = {
          iterator: values(iterable),
          resultName: resultName,
          nextLoc: nextLoc
        };

        if (this.method === 'next') {
          // Deliberately forget the last sent value so that we don't
          // accidentally pass it on to the delegate.
          this.arg = undefined$1;
        }

        return ContinueSentinel;
      }
    };

    // Regardless of whether this script is executing as a CommonJS module
    // or not, return the runtime object so that we can declare the variable
    // regeneratorRuntime in the outer scope, which allows this module to be
    // injected easily by `bin/regenerator --include-runtime script.js`.
    return exports;
  })(
    // If this script is executing as a CommonJS module, use module.exports
    // as the regeneratorRuntime namespace. Otherwise create a new empty
    // object. Either way, the resulting object will be used to initialize
    // the regeneratorRuntime variable at the top of this file.
    module.exports
  );

  try {
    regeneratorRuntime = runtime;
  } catch (accidentalStrictMode) {
    // This module should not be running in strict mode, so the above
    // assignment should always work unless something is misconfigured. Just
    // in case runtime.js accidentally runs in strict mode, we can escape
    // strict mode using a global Function call. This could conceivably fail
    // if a Content Security Policy forbids using Function, but in that case
    // the proper solution is to fix the accidental strict mode problem. If
    // you've misconfigured your bundler to force strict mode and applied a
    // CSP to forbid Function, and you're not willing to fix either of those
    // problems, please detail your unique predicament in a GitHub issue.
    Function('r', 'regeneratorRuntime = r')(runtime);
  }
});

var regenerator = runtime_1;

var padString_1$1 = createCommonjsModule(function (module, exports) {
  Object.defineProperty(exports, '__esModule', { value: true });
  function padString(input) {
    var segmentLength = 4;
    var stringLength = input.length;
    var diff = stringLength % segmentLength;
    if (!diff) {
      return input;
    }
    var position = stringLength;
    var padLength = segmentLength - diff;
    var paddedStringLength = stringLength + padLength;
    var buffer = buffer.Buffer.alloc(paddedStringLength);
    buffer.write(input);
    while (padLength--) {
      buffer.write('=', position++);
    }
    return buffer.toString();
  }
  exports.default = padString;
});

var base64url_1$1 = createCommonjsModule(function (module, exports) {
  Object.defineProperty(exports, '__esModule', { value: true });

  function encode(input, encoding) {
    if (encoding === void 0) {
      encoding = 'utf8';
    }
    if (buffer.Buffer.isBuffer(input)) {
      return fromBase64(input.toString('base64'));
    }
    return fromBase64(buffer.Buffer.from(input, encoding).toString('base64'));
  }
  function decode(base64url, encoding) {
    if (encoding === void 0) {
      encoding = 'utf8';
    }
    return buffer.Buffer.from(toBase64(base64url), 'base64').toString(encoding);
  }
  function toBase64(base64url) {
    base64url = base64url.toString();
    return padString_1$1.default(base64url).replace(/\-/g, '+').replace(/_/g, '/');
  }
  function fromBase64(base64) {
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function toBuffer(base64url) {
    return buffer.Buffer.from(toBase64(base64url), 'base64');
  }
  var base64url = encode;
  base64url.encode = encode;
  base64url.decode = decode;
  base64url.toBase64 = toBase64;
  base64url.fromBase64 = fromBase64;
  base64url.toBuffer = toBuffer;
  exports.default = base64url;
});

var base64url = createCommonjsModule(function (module) {
  module.exports = base64url_1$1.default;
  module.exports.default = module.exports;
});

function r$3() {
  var r = new Map();
  return function (e, t) {
    try {
      var i = !1;
      function n(n) {
        if (i) return n;
        var o = r.get(e.did);
        return void 0 !== o
          ? o
          : Promise.resolve(t()).then(function (t) {
              return r.set(e.did, t), t;
            });
      }
      var o = (function () {
        if (e.params && 'true' === e.params['no-cache']) return (i = !0), Promise.resolve(t());
      })();
      return Promise.resolve(o && o.then ? o.then(n) : n(o));
    } catch (r) {
      return Promise.reject(r);
    }
  };
}
function e$1(r, e) {
  return e();
}
var t$1 = new RegExp(
  '^did:([a-zA-Z0-9_]+):([a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)*)((;[a-zA-Z0-9_.:%-]+=[a-zA-Z0-9_.:%-]*)*)(/[^#?]*)?([?][^#]*)?(#.*)?$'
);
function i$2(r) {
  if ('' === r || !r) throw new Error('Missing DID');
  var e = r.match(t$1);
  if (e) {
    var i = { did: 'did:' + e[1] + ':' + e[2], method: e[1], id: e[2], didUrl: r };
    if (e[4]) {
      var n = e[4].slice(1).split(';');
      i.params = {};
      for (var o = 0, a = n; o < a.length; o += 1) {
        var s = a[o].split('=');
        i.params[s[0]] = s[1];
      }
    }
    return e[6] && (i.path = e[6]), e[7] && (i.query = e[7].slice(1)), e[8] && (i.fragment = e[8].slice(1)), i;
  }
  throw new Error('Invalid DID ' + r);
}
var n$1 = function (t, i) {
  void 0 === t && (t = {}), (this.registry = t), (this.cache = !0 === i ? r$3() : i || e$1);
};
n$1.prototype.resolve = function (r) {
  var e = this;
  try {
    var t = i$2(r),
      n = this.registry[t.method];
    return n
      ? this.cache(t, function () {
          return n(t.did, t, e);
        })
      : Promise.reject(new Error("Unsupported DID method: '" + t.method + "'"));
  } catch (r) {
    return Promise.reject(r);
  }
};

var resolver_esm = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  inMemoryCache: r$3,
  noCache: e$1,
  parse: i$2,
  Resolver: n$1
});

var _regenerator = interopRequireDefault(regenerator);

var _asyncToGenerator2 = interopRequireDefault(asyncToGenerator);

var _ipfsDidDocument = interopRequireDefault(ipfsDidDocument);

var _base64url = interopRequireDefault(base64url);

var PUBKEY_IDS = ['signingKey', 'managementKey', 'encryptionKey'];
var SUB_PUBKEY_IDS = ['subSigningKey', 'subEncryptionKey'];

function validateDoc(doc) {
  var pubKeyIds = PUBKEY_IDS;

  if (!doc || !doc.publicKey || !doc.authentication) {
    throw new Error('Not a valid 3ID');
  }

  if (doc.root) {
    pubKeyIds = SUB_PUBKEY_IDS;
    if (!doc.space) throw new Error('Not a valid 3ID');
  }

  doc.publicKey.map(function (entry) {
    var id = entry.id.split('#')[1];
    if (!pubKeyIds.includes(id)) throw new Error('Not a valid 3ID');
  });
}

function encodeSection(data) {
  return _base64url['default'].encode(JSON.stringify(data));
}

function verifyProof(_x, _x2) {
  return _verifyProof.apply(this, arguments);
}

function _verifyProof() {
  _verifyProof = (0, _asyncToGenerator2['default'])(
    /*#__PURE__*/ _regenerator['default'].mark(function _callee3(subDoc, resolver) {
      var subSigningKey, subEncryptionKey, payload, header, jwt;
      return _regenerator['default'].wrap(function _callee3$(_context3) {
        while (1) {
          switch ((_context3.prev = _context3.next)) {
            case 0:
              subSigningKey = subDoc.publicKey.find(function (entry) {
                return entry.id.includes(SUB_PUBKEY_IDS[0]);
              }).publicKeyHex;
              subEncryptionKey = subDoc.publicKey.find(function (entry) {
                return entry.id.includes(SUB_PUBKEY_IDS[1]);
              }).publicKeyBase64;
              payload = encodeSection({
                iat: null,
                subSigningKey: subSigningKey,
                subEncryptionKey: subEncryptionKey,
                space: subDoc.space,
                iss: subDoc.root
              });
              header = encodeSection({
                typ: 'JWT',
                alg: subDoc.proof.alg
              });
              jwt = ''.concat(header, '.').concat(payload, '.').concat(subDoc.proof.signature);
              _context3.next = 7;
              return (0, lib.verifyJWT)(jwt, {
                resolver: resolver
              });

            case 7:
            case 'end':
              return _context3.stop();
          }
        }
      }, _callee3);
    })
  );
  return _verifyProof.apply(this, arguments);
}

function mergeDocuments(doc, subDoc) {
  subDoc.publicKey = doc.publicKey.concat(subDoc.publicKey);
  return subDoc;
}

function getResolver(ipfs) {
  var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
    pin = _ref.pin;

  function resolve(_x3, _x4) {
    return _resolve2.apply(this, arguments);
  }

  function _resolve2() {
    _resolve2 = (0, _asyncToGenerator2['default'])(
      /*#__PURE__*/ _regenerator['default'].mark(function _callee2(did, parsed) {
        var _resolve, _resolve3;

        return _regenerator['default'].wrap(function _callee2$(_context2) {
          while (1) {
            switch ((_context2.prev = _context2.next)) {
              case 0:
                _resolve3 = function _resolve5() {
                  _resolve3 = (0, _asyncToGenerator2['default'])(
                    /*#__PURE__*/ _regenerator['default'].mark(function _callee(cid) {
                      var isRoot,
                        doc,
                        rootDoc,
                        _args = arguments;
                      return _regenerator['default'].wrap(
                        function _callee$(_context) {
                          while (1) {
                            switch ((_context.prev = _context.next)) {
                              case 0:
                                isRoot = _args.length > 1 && _args[1] !== undefined ? _args[1] : false;
                                _context.prev = 1;
                                _context.next = 4;
                                return _ipfsDidDocument['default'].cidToDocument(ipfs, cid);

                              case 4:
                                doc = _context.sent;
                                validateDoc(doc);

                                if (!doc.root) {
                                  _context.next = 15;
                                  break;
                                }

                                if (!isRoot) {
                                  _context.next = 9;
                                  break;
                                }

                                throw new Error('Only one layer subDoc allowed');

                              case 9:
                                _context.next = 11;
                                return _resolve(doc.root.split(':')[2], true);

                              case 11:
                                rootDoc = _context.sent;
                                _context.next = 14;
                                return verifyProof(doc, localResolver);

                              case 14:
                                doc = mergeDocuments(rootDoc, doc);

                              case 15:
                                if (!pin) {
                                  _context.next = 18;
                                  break;
                                }

                                _context.next = 18;
                                return ipfs.pin.add(cid);

                              case 18:
                                _context.next = 31;
                                break;

                              case 20:
                                _context.prev = 20;
                                _context.t0 = _context['catch'](1);
                                _context.prev = 22;

                                if (!pin) {
                                  _context.next = 26;
                                  break;
                                }

                                _context.next = 26;
                                return ipfs.pin.rm(cid);

                              case 26:
                                _context.next = 30;
                                break;

                              case 28:
                                _context.prev = 28;
                                _context.t1 = _context['catch'](22);

                              case 30:
                                throw new Error('Invalid 3ID');

                              case 31:
                                return _context.abrupt('return', doc);

                              case 32:
                              case 'end':
                                return _context.stop();
                            }
                          }
                        },
                        _callee,
                        null,
                        [
                          [1, 20],
                          [22, 28]
                        ]
                      );
                    })
                  );
                  return _resolve3.apply(this, arguments);
                };

                _resolve = function _resolve4(_x5) {
                  return _resolve3.apply(this, arguments);
                };

                return _context2.abrupt('return', _resolve(parsed.id));

              case 3:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2);
      })
    );
    return _resolve2.apply(this, arguments);
  }

  var resolveMethods = {
    3: resolve
  };
  var localResolver = new resolver_esm.Resolver(resolveMethods);
  return resolveMethods;
}

var resolver = {
  getResolver: getResolver
};

/* global SmartWeave, ContractAssert, ContractError */

function checkPayload(state, payload) {
  const caller = payload.iss;
  const callerTimestamps = state.timestamps[caller];
  ContractAssert(!callerTimestamps || !callerTimestamps.includes(payload.iat), 'Timestamp provided has been reused');

  const contractId = SmartWeave.contract.id;

  ContractAssert(contractId, 'No contract ID provided.');
  ContractAssert(contractId === payload.contractId, 'The contract ID provided is invalid.');
}

function isNotPreviousChild(communityId, state) {
  return typeof state.children[communityId] === 'undefined';
}

function setTimeStamp(state, payload) {
  if (!state.timestamps[payload.iss]) {
    state.timestamps[payload.iss] = [];
    state.timestamps[payload.iss].push(payload.iat);
  } else {
    state.timestamps[payload.iss].push(payload.iat);
  }
}

async function getPayload(jwt, ipfs) {
  const threeIdResolver = resolver.getResolver(ipfs);
  const resolverWrapper = new i$1(threeIdResolver);

  let verifiedJWT;
  try {
    verifiedJWT = await lib.verifyJWT(jwt, { resolver: resolverWrapper });
  } catch (e) {
    throw new ContractError(`JWT verification failed: ${e}`);
  }

  return verifiedJWT.payload;
}

/* global ContractAssert, ContractError */

async function handle(state, action) {
  const payload = await getPayload(action.input, action.ipfs);

  // ensure the payload has the correct nonce and contract id. This prevents reusing a signature.
  checkPayload(state, payload);

  setTimeStamp(state, payload);

  const op = checkRoleOps(state, payload);
  if (op.isRoleOp) return { state: op.state };

  const { input } = payload;

  if (input.function === functionTypes$1.SET_ACCESS) {
    ContractAssert(hasAdminPrivileges(payload.iss, state), 'Must have admin privileges to set access');

    state.isOpen = input.isOpen;
    return { state };
  }

  if (input.function === functionTypes$1.ADD_CHILD) {
    // can be called by anyone if the community has not previously been removed
    // otherwise must be called by admin
    ContractAssert(
      isNotPreviousChild(input.communityId, state) || hasAdminPrivileges(payload.iss, state),
      'A community that has been removed can only be added back with admin privileges'
    );

    state.children[input.communityId] = true;

    return { state };
  }

  if (input.function === functionTypes$1.REMOVE_CHILD) {
    ContractAssert(hasAdminPrivileges(payload.iss, state), 'Caller must have admin privileges to remove a community');

    state.children[input.communityId] = false;

    return { state };
  }

  if (input.function === functionTypes$1.SET_NAME) {
    ContractAssert(
      hasAdminPrivileges(payload.iss, state),
      'Caller must have admin privileges to set the name of a community'
    );

    state.name = input.name;

    return { state };
  }

  if (input.function === functionTypes$1.SET_GUIDELINES) {
    ContractAssert(
      hasAdminPrivileges(payload.iss, state),
      'Caller must have admin privileges to set the guidelines of a community'
    );

    state.guidelines = input.guidelines;

    return { state };
  }

  throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
}
