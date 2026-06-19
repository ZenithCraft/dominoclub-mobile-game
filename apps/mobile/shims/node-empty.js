// Empty-module shim used by metro.config.js for Node built-ins that some
// pure-JS libraries (jimp-compact, etc.) `require()` defensively but never
// actually call when used with the inputs we hand them. Returning an empty
// object lets Metro resolve the bundle; any runtime call would throw, which
// is fine because we wrap the offending library in a try/catch and fall
// back to a pass-through path.
module.exports = {};
