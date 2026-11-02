/*
 * Checks the module the Impact Analysis page gives each planned file (viewModels/impact.js, moduleOf): from its folders,
 * one module for a feature's view, view model and texts, never a kind of folder. Runs with Node alone, before the build:
 * node scripts/check-modules.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'viewModels', 'impact.js'), 'utf8');
const start = source.indexOf('    const KIND_FOLDERS');
const end = source.indexOf('    const fileName');
if (start < 0 || end < start) {
  console.error('Module check: moduleOf was not found in impact.js');
  process.exit(1);
}
const moduleOf = new Function(source.substring(start, end) + '\nreturn moduleOf;')();

const cases = [
  ['backend/src/com/bank/obdx/payments/service/StandInstructionService.java', 'payments'],
  ['backend/src/com/bank/obdx/payments/service/StandInstructionHostAdapter.java', 'payments'],
  ['backend/src/com/bank/obdx/payments/StandInstructionResource.java', 'payments'],
  ['channel/components/modules/payments/stand-instr-list/stand-instr-list.js', 'payments'],
  ['channel/components/modules/payments/stand-instr-list/model.js', 'payments'],
  ['db/stand-instr/01_create_table.sql', 'stand-instr'],
  // bank-a-22: one feature's view, view model and texts are one module, not viewModels, views and nls
  ['ui/js/viewModels/fund-transfer.js', 'fund-transfer'],
  ['ui/js/views/fund-transfer.html', 'fund-transfer'],
  ['ui/resources/nls/fund-transfer.js', 'fund-transfer'],
  // a React Native or React app: not app, components or services
  ['app/src/api/standingInstructions.ts', 'standingInstructions'],
  ['app/src/components/Payments.tsx', 'Payments'],
  ['app/src/services/payees.ts', 'payees'],
  ['app/src/screens/payments/SiList.tsx', 'payments'],
  ['README.md', 'README']
];

let failed = 0;
for (const [file, expected] of cases) {
  const got = moduleOf(file);
  if (got !== expected) {
    failed++;
    console.error('Module check failed: ' + file + ' gave ' + got + ', expected ' + expected);
  }
}
if (failed) {
  process.exit(1);
}
console.log('Modules: ' + cases.length + ' paths as expected.');
