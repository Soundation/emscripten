// Copyright 2014 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

var LibraryMonitor = {
  $EmscriptenMonitor__deps: [
    'emscripten_trace_js_configure', 'emscripten_trace_configure_for_google_wtf',
    'emscripten_trace_js_enter_context', 'emscripten_trace_exit_context',
    'emscripten_trace_js_log_message', 'emscripten_trace_js_mark',
    'emscripten_get_now'
  ],
  $EmscriptenMonitor__postset: 'EmscriptenMonitor.init()',
  $EmscriptenMonitor: {
    worker: null,
    collectorEnabled: false,
    googleWTFEnabled: false,
    testingEnabled: false,

    googleWTFData: {
      'scopeStack': [],
      'cachedScopes': {}
    },

    DATA_VERSION: 1,

    EVENT_ALLOCATE: 'allocate',
    EVENT_ANNOTATE_TYPE: 'annotate-type',
    EVENT_APPLICATION_NAME: 'application-name',
    EVENT_ASSOCIATE_STORAGE_SIZE: 'associate-storage-size',
    EVENT_ENTER_CONTEXT: 'enter-context',
    EVENT_EXIT_CONTEXT: 'exit-context',
    EVENT_FRAME_END: 'frame-end',
    EVENT_FRAME_RATE: 'frame-rate',
    EVENT_FRAME_START: 'frame-start',
    EVENT_FREE: 'free',
    EVENT_LOG_MESSAGE: 'log-message',
    EVENT_MEMORY_LAYOUT: 'memory-layout',
    EVENT_OFF_HEAP: 'off-heap',
    EVENT_REALLOCATE: 'reallocate',
    EVENT_REPORT_ERROR: 'report-error',
    EVENT_SESSION_NAME: 'session-name',
    EVENT_TASK_ASSOCIATE_DATA: 'task-associate-data',
    EVENT_TASK_END: 'task-end',
    EVENT_TASK_RESUME: 'task-resume',
    EVENT_TASK_START: 'task-start',
    EVENT_TASK_SUSPEND: 'task-suspend',
    EVENT_USER_NAME: 'user-name',

    init: function() {
      Module['emscripten_trace_configure'] = _emscripten_trace_js_configure;
      Module['emscripten_trace_configure_for_google_wtf'] = _emscripten_trace_configure_for_google_wtf;
      Module['emscripten_trace_enter_context'] = _emscripten_trace_js_enter_context;
      Module['emscripten_trace_exit_context'] = _emscripten_trace_exit_context;
      Module['emscripten_trace_log_message'] = _emscripten_trace_js_log_message;
      Module['emscripten_trace_mark'] = _emscripten_trace_js_mark;
    },

    // Work around CORS issues ...
    loadWorkerViaXHR: function(url, ready, scope) {
      var req = new XMLHttpRequest();
      req.addEventListener('load', function() {
        var blob = new Blob([this.responseText], { type: 'text/javascript' });
        var worker = new Worker(window.URL.createObjectURL(blob));
        if (ready) {
          ready.call(scope, worker);
        }
      }, req);
      req.open("get", url, false);
      req.send();
    },

    configure: function(collector_url, application) {
      EmscriptenMonitor.now = _emscripten_get_now;
      var now = new Date();
      var session_id = now.getTime().toString() + '_' +
                          Math.floor((Math.random() * 100) + 1).toString();
      EmscriptenMonitor.loadWorkerViaXHR(collector_url + 'worker.js', function (worker) {
        EmscriptenMonitor.worker = worker;
        EmscriptenMonitor.worker.addEventListener('error', function (e) {
          console.log('TRACE WORKER ERROR:');
          console.log(e);
        }, false);
        EmscriptenMonitor.worker.postMessage({ 'cmd': 'configure',
                                             'data_version': EmscriptenMonitor.DATA_VERSION,
                                             'session_id': session_id,
                                             'url': collector_url });
        EmscriptenMonitor.configured = true;
        EmscriptenMonitor.collectorEnabled = true;
        EmscriptenMonitor.postEnabled = true;
      });
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_APPLICATION_NAME, application]);
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_SESSION_NAME, now.toISOString()]);
    },

    configureForTest: function() {
      EmscriptenMonitor.postEnabled = true;
      EmscriptenMonitor.testingEnabled = true;
      EmscriptenMonitor.now = function() { return 0.0; };
    },

    configureForGoogleWTF: function() {
      if (window && window.wtf) {
        EmscriptenMonitor.googleWTFEnabled = true;
      } else {
        console.log('GOOGLE WTF NOT AVAILABLE TO ENABLE');
      }
    },

    post: function(entry) {
      if (EmscriptenMonitor.postEnabled && EmscriptenMonitor.collectorEnabled) {
        EmscriptenMonitor.worker.postMessage({ 'cmd': 'post',
                                             'entry': entry });
      } else if (EmscriptenMonitor.postEnabled && EmscriptenMonitor.testingEnabled) {
        out('Tracing ' + entry);
      }
    },

    googleWTFEnterScope: function(name) {
      var scopeEvent = EmscriptenMonitor.googleWTFData['cachedScopes'][name];
      if (!scopeEvent) {
        scopeEvent = window.wtf.trace.events.createScope(name);
        EmscriptenMonitor.googleWTFData['cachedScopes'][name] = scopeEvent;
      }
      var scope = scopeEvent();
      EmscriptenMonitor.googleWTFData['scopeStack'].push(scope);
    },

    googleWTFExitScope: function() {
      var scope = EmscriptenMonitor.googleWTFData['scopeStack'].pop();
      window.wtf.trace.leaveScope(scope);
    }
  },

  emscripten_trace_js_configure: function(collector_url, application) {
    EmscriptenMonitor.configure(collector_url, application);
  },

  emscripten_trace_configure: function(collector_url, application) {
    EmscriptenMonitor.configure(UTF8ToString(collector_url),
                              UTF8ToString(application));
  },

  emscripten_trace_configure_for_test: function() {
    EmscriptenMonitor.configureForTest();
  },

  emscripten_trace_configure_for_google_wtf: function() {
    EmscriptenMonitor.configureForGoogleWTF();
  },

  emscripten_trace_set_enabled: function(enabled) {
    EmscriptenMonitor.postEnabled = !!enabled;
  },

  emscripten_trace_set_session_username: function(username) {
    EmscriptenMonitor.post(EmscriptenMonitor.EVENT_USER_NAME, UTF8ToString(username));
  },

  emscripten_trace_record_frame_start: function() {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_FRAME_START, now]);
    }
  },

  emscripten_trace_record_frame_end: function() {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_FRAME_END, now]);
    }
  },

  emscripten_trace_js_log_message: function(channel, message) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_LOG_MESSAGE, now,
                            channel, message]);
    }
  },

  emscripten_trace_log_message: function(channel, message) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_LOG_MESSAGE, now,
                            UTF8ToString(channel),
                            UTF8ToString(message)]);
    }
  },

  emscripten_trace_js_mark: function(message) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_LOG_MESSAGE, now,
                            "MARK", message]);
    }
    if (EmscriptenMonitor.googleWTFEnabled) {
      window.wtf.trace.mark(message);
    }
  },

  emscripten_trace_mark: function(message) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_LOG_MESSAGE, now,
                            "MARK", UTF8ToString(message)]);
    }
    if (EmscriptenMonitor.googleWTFEnabled) {
      window.wtf.trace.mark(UTF8ToString(message));
    }
  },

  emscripten_trace_report_error: function(error) {
    var now = EmscriptenMonitor.now();
    var callstack = (new Error).stack;
    EmscriptenMonitor.post([EmscriptenMonitor.EVENT_REPORT_ERROR, now,
                          UTF8ToString(error), callstack]);
  },

  emscripten_trace_record_allocation: function(address, size) {
    if (typeof Module['onMalloc'] === 'function') Module['onMalloc'](address, size);
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_ALLOCATE,
                            now, address, size]);
    }
  },

  emscripten_trace_record_reallocation: function(old_address, new_address, size) {
    if (typeof Module['onRealloc'] === 'function') Module['onRealloc'](old_address, new_address, size);
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_REALLOCATE,
                            now, old_address, new_address, size]);
    }
  },

  emscripten_trace_record_free: function(address) {
    if (typeof Module['onFree'] === 'function') Module['onFree'](address);
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_FREE,
                            now, address]);
    }
  },

  emscripten_trace_annotate_address_type: function(address, type_name) {
    if (EmscriptenMonitor.postEnabled) {
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_ANNOTATE_TYPE, address,
                            UTF8ToString(type_name)]);
    }
  },

  emscripten_trace_associate_storage_size: function(address, size) {
    if (EmscriptenMonitor.postEnabled) {
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_ASSOCIATE_STORAGE_SIZE,
                            address, size]);
    }
  },

  emscripten_trace_report_memory_layout: function() {
    if (EmscriptenMonitor.postEnabled) {
      var memory_layout = {
        'static_base':  STATIC_BASE,
        'stack_base':   STACK_BASE,
        'stack_top':    STACKTOP,
        'stack_max':    STACK_MAX,
        'dynamic_base': DYNAMIC_BASE,
        'dynamic_top':  HEAP32[DYNAMICTOP_PTR>>2],
        'total_memory': TOTAL_MEMORY
      };
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_MEMORY_LAYOUT,
                            now, memory_layout]);
    }
  },

  emscripten_trace_report_off_heap_data: function () {
    function openal_audiodata_size() {
      if (typeof AL == 'undefined' || !AL.currentContext) {
        return 0;
      }
      var totalMemory = 0;
      for (var i in AL.currentContext.buf) {
        var buffer = AL.currentContext.buf[i];
        for (var channel = 0; channel < buffer.numberOfChannels; ++channel) {
          totalMemory += buffer.getChannelData(channel).length * 4;
        }
      }
      return totalMemory;
    }
    if (EmscriptenMonitor.postEnabled) {
      var off_heap_data = {
        'openal': openal_audiodata_size()
      }
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_OFF_HEAP, now, off_heap_data]);
    }
  },

  emscripten_trace_js_enter_context: function(name) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_ENTER_CONTEXT,
                            now, name]);
    }
    if (EmscriptenMonitor.googleWTFEnabled) {
      EmscriptenMonitor.googleWTFEnterScope(name);
    }
  },

  emscripten_trace_enter_context: function(name) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_ENTER_CONTEXT,
                            now, UTF8ToString(name)]);
    }
    if (EmscriptenMonitor.googleWTFEnabled) {
      EmscriptenMonitor.googleWTFEnterScope(UTF8ToString(name));
    }
  },

  emscripten_trace_exit_context: function() {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_EXIT_CONTEXT, now]);
    }
    if (EmscriptenMonitor.googleWTFEnabled) {
      EmscriptenMonitor.googleWTFExitScope();
    }
  },

  emscripten_trace_task_start: function(task_id, name) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_TASK_START,
                            now, task_id, UTF8ToString(name)]);
    }
  },

  emscripten_trace_task_associate_data: function(key, value) {
    if (EmscriptenMonitor.postEnabled) {
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_TASK_ASSOCIATE_DATA,
                            UTF8ToString(key),
                            UTF8ToString(value)]);
    }
  },

  emscripten_trace_task_suspend: function(explanation) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_TASK_SUSPEND,
                            now, UTF8ToString(explanation)]);
    }
  },

  emscripten_trace_task_resume: function(task_id, explanation) {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_TASK_RESUME,
                            now, task_id, UTF8ToString(explanation)]);
    }
  },

  emscripten_trace_task_end: function() {
    if (EmscriptenMonitor.postEnabled) {
      var now = EmscriptenMonitor.now();
      EmscriptenMonitor.post([EmscriptenMonitor.EVENT_TASK_END, now]);
    }
  },

  emscripten_trace_close: function() {
    EmscriptenMonitor.collectorEnabled = false;
    EmscriptenMonitor.googleWTFEnabled = false;
    EmscriptenMonitor.postEnabled = false;
    EmscriptenMonitor.testingEnabled = false;
    EmscriptenMonitor.worker.postMessage({ 'cmd': 'close' });
    EmscriptenMonitor.worker = null;
  },
};

autoAddDeps(LibraryMonitor, '$EmscriptenMonitor');
mergeInto(LibraryManager.library, LibraryMonitor);
