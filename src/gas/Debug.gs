// =====================================================
// 🐞 디버깅 모듈 (In-Memory Log Collector)
// =====================================================

var Debug = {
  logs: [],
  startTime: 0,

  start: function () {
    this.logs = [];
    this.startTime = new Date().getTime();
    this.log("🕒 Execution Started");
  },

  log: function (msg) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    console.log(msg); // Stackdriver에도 남김
    this.logs.push(`${timestamp} ${msg}`);
  },

  warn: function (msg) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    console.warn(msg);
    this.logs.push(`⚠️ ${timestamp} ${msg}`);
  },

  error: function (msg, err) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    const errMsg = err ? ` | Error: ${err.message}\nStack: ${err.stack}` : "";
    console.error(msg + errMsg);
    this.logs.push(`❌ ${timestamp} ${msg}${errMsg}`);
  },

  getLogs: function () {
    return this.logs;
  },
};

// 테스트용 함수 (유지)
function testSetup() {
  Debug.start();
  Debug.log("Test Log 1");
  try {
    throw new Error("Test Error");
  } catch (e) {
    Debug.error("Test Exception catch", e);
  }
  return Debug.getLogs();
}
