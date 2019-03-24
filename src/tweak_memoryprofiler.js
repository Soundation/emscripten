// Copyright 2015 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

var emscriptenMemoryMonitor = {
  // If true, walks all allocated pointers at graphing time to print a detailed memory fragmentation map. If false, used
  // memory is only graphed in one block (at the bottom of DYNAMIC memory space). Set this to false to improve performance at the expense of
  // accuracy.
  detailedHeapUsage: true,

  // How often the log page is refreshed.
  uiUpdateIntervalMsecs: 2000,

  // Stores an associative array of records HEAP ptr -> size so that we can retrieve how much memory was freed in calls to 
  // _free() and decrement the tracked usage accordingly.
  // E.g. sizeOfAllocatedPtr[address] returns the size of the heap pointer starting at 'address'.
  sizeOfAllocatedPtr: {},

  // Conceptually same as the above array, except this one tracks only pointers that were allocated during the application preRun step, which
  // corresponds to the data added to the VFS with --preload-file.
  sizeOfPreRunAllocatedPtr: {},

  // Once set to true, preRun is finished and the above array is not touched anymore.
  pagePreRunIsFinished: false,

  // Grand total of memory currently allocated via malloc(). Decremented on free()s.
  totalMemoryAllocated: 0,

  // The running count of the number of times malloc() and free() have been called in the app. Used to keep track of # of currently alive pointers.
  // TODO: Perhaps in the future give a statistic of allocations per second to see how trashing memory usage is.
  totalTimesMallocCalled: 0,
  totalTimesFreeCalled: 0,

  peakMemory: 0,

  // Converts number f to string with at most two decimals, without redundant trailing zeros.
  truncDec: function truncDec(f) {
    f = f || 0;
    var str = f.toFixed(2);
    if (str.indexOf('.00', str.length-3) !== -1) return str.substr(0, str.length-3);
    else if (str.indexOf('0', str.length-1) !== -1) return str.substr(0, str.length-1);
    else return str;
  },

  // Converts a number of bytes pretty-formatted as a string.
  formatBytes: function formatBytes(bytes) {
    if (bytes >= 1000*1024*1024) return this.truncDec(bytes/(1024*1024*1024)) + ' GB';
    else if (bytes >= 1000*1024) return this.truncDec(bytes/(1024*1024)) + ' MB';
    else if (bytes >= 1000) return this.truncDec(bytes/1024) + ' KB';
    else return this.truncDec(bytes) + ' B';
  },

  onMalloc: function onMalloc(ptr, size) {
    if (!ptr) return;
    if (this.sizeOfAllocatedPtr[ptr])
    {
// Uncomment to debug internal workings of tracing:
//      console.error('Allocation error in onMalloc! Pointer ' + ptr + ' had already been tracked as allocated!');
//      console.error('Previous site of allocation: ' + this.allocationSitePtrs[ptr]);
//      console.error('This doubly attempted site of allocation: ' + new Error().stack.toString());
//      throw 'malloc internal inconsistency!';
      return;
    }
    // Gather global stats.
    this.totalMemoryAllocated += size;
    ++this.totalTimesMallocCalled;
    
    // Remember the size of the allocated block to know how much will be _free()d later.
    this.sizeOfAllocatedPtr[ptr] = size;
    // Also track if this was a _malloc performed at preRun time.
    if (!this.pagePreRunIsFinished) this.sizeOfPreRunAllocatedPtr[ptr] = size;

    if(this.totalMemoryAllocated > this.peakMemory)
      this.peakMemory =  this.totalMemoryAllocated;
 },

  onFree: function onFree(ptr) {
    if (!ptr) return;

    // Decrement global stats.
    var sz = this.sizeOfAllocatedPtr[ptr];
    if (!isNaN(sz)) this.totalMemoryAllocated -= sz;
    else
    {
// Uncomment to debug internal workings of tracing:
//      console.error('Detected double free of pointer ' + ptr + ' at location:\n'+ new Error().stack.toString());
//      throw 'double free!';
      return;
    }

    delete this.sizeOfAllocatedPtr[ptr];
    delete this.sizeOfPreRunAllocatedPtr[ptr]; // Also free if this happened to be a _malloc performed at preRun time.
    ++this.totalTimesFreeCalled;
  },

  onRealloc: function onRealloc(oldAddress, newAddress, size) {
    this.onFree(oldAddress);
    this.onMalloc(newAddress, size);
  },

  onPreloadComplete: function onPreloadComplete() {
    this.pagePreRunIsFinished = true;
    // It is common to set 'overflow: hidden;' on canvas pages that do WebGL. When MemoryProfiler is being used, there will be a long block of text on the page, so force-enable scrolling.
    document.body.style.overflow = '';
  },

  // Installs startup hook and periodic UI update timer.
  initialize: function initialize() {
    // Inject the memoryprofiler hooks.
    Module['onMalloc'] = function onMalloc(ptr, size) { emscriptenMemoryMonitor.onMalloc(ptr, size); };
    Module['onRealloc'] = function onRealloc(oldAddress, newAddress, size) { emscriptenMemoryMonitor.onRealloc(oldAddress, newAddress, size); };
    Module['onFree'] = function onFree(ptr) { emscriptenMemoryMonitor.onFree(ptr); };

    // Add a tracking mechanism to detect when VFS loading is complete.
    if (!Module['preRun']) Module['preRun'] = [];
    Module['preRun'].push(function() { emscriptenMemoryMonitor.onPreloadComplete(); });

    var self = this;
    function populateHtmlBody() {
      self.updateUi();
      setInterval(function() { emscriptenMemoryMonitor.updateUi() }, self.uiUpdateIntervalMsecs);
    };
    setTimeout(populateHtmlBody, 1000);
  },

  countOpenALAudioDataSize: function countOpenALAudioDataSize() {
    if (typeof AL == "undefined" || !AL.currentContext) return 0;

    var totalMemory = 0;

    for (var i in AL.currentContext.buf) {
      var buffer = AL.currentContext.buf[i];
      for (var channel = 0; channel < buffer.numberOfChannels; ++channel) totalMemory += buffer.getChannelData(channel).length * 4;
    }
    return totalMemory;
  },

  // Main UI update entry point.
  updateUi: function updateUi() {
    var DYNAMICTOP = HEAP32[DYNAMICTOP_PTR>>2];
    err("DYNAMIC memory area used: " + this.formatBytes(this.totalMemoryAllocated) + " peak: " + this.formatBytes(this.peakMemory));
  }
};

// Backwards compatibility with previously compiled code. Don't call this anymore!
function memoryprofiler_add_hooks() { emscriptenMemoryMonitor.initialize(); }

if (typeof Module !== 'undefined' && typeof document !== 'undefined' && typeof window !== 'undefined' && typeof process === 'undefined') emscriptenMemoryMonitor.initialize();
