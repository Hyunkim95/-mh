web: node --require @libs/logger/instrument --max-old-space-size=460 apps/api/dist/index.js
scheduler: SCHEDULER_ENABLED=true node --require @libs/logger/instrument apps/api/dist/index.js
indexer: DUAL_DIRECTION_ENABLED=true node --require @libs/logger/instrument apps/api/dist/index.js
