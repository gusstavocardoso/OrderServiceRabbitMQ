module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000,
  // Evita que o Jest tente carregar arquivos do node_modules
  testPathIgnorePatterns: ['/node_modules/'],
  // Coleta coverage apenas dos arquivos de src
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',       // entry point — não testável isoladamente
    '!src/migrations/**',  // SQL puro
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      lines: 75,
      functions: 75,
      branches: 60,
      statements: 75,
    },
  },
  // Mostra cada teste individualmente no output
  verbose: false,
};
