module.exports = {
  target: (name) => (name === '@types/node' ? 'minor' : 'latest'),
};
