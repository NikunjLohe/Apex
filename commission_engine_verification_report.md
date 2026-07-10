# Commission Engine Verification Report

## Test 1 – Full Hierarchy (All 18 Ranks)

| Rank | Agent | Commission Type | % Allocated | Amount | Running Total | PASS/FAIL |
|---|---|---|---|---|---|---|
| Rank 1 (AO) | Agent AO | AO Commission (Direct) | 8.00% | ₹9600.00 | ₹9600.00 | ✅ PASS |
| Rank 2 (SAO) | Agent SAO | SAO Own Commission | 2.00% | ₹2400.00 | ₹12000.00 | ✅ PASS |
| Rank 3 (DO) | Agent DO | DO Own Commission | 2.00% | ₹2400.00 | ₹14400.00 | ✅ PASS |
| Rank 4 (SDO) | Agent SDO | SDO Own Commission | 2.00% | ₹2400.00 | ₹16800.00 | ✅ PASS |
| Rank 5 (ADO) | Agent ADO | ADO Own Commission | 2.00% | ₹2400.00 | ₹19200.00 | ✅ PASS |
| Rank 6 (CADO) | Agent CADO | CADO Own Commission | 2.00% | ₹2400.00 | ₹21600.00 | ✅ PASS |
| Rank 7 (BM) | Agent BM | BM Own Commission | 2.00% | ₹2400.00 | ₹24000.00 | ✅ PASS |
| Rank 8 (SBM) | Agent SBM | SBM Own Commission | 1.00% | ₹1200.00 | ₹25200.00 | ✅ PASS |
| Rank 9 (ABM) | Agent ABM | ABM Own Commission | 1.00% | ₹1200.00 | ₹26400.00 | ✅ PASS |
| Rank 10 (RBM) | Agent RBM | RBM Own Commission | 1.00% | ₹1200.00 | ₹27600.00 | ✅ PASS |
| Rank 11 (ZBM) | Agent ZBM | ZBM Own Commission | 1.00% | ₹1200.00 | ₹28800.00 | ✅ PASS |
| Rank 12 (DBM) | Agent DBM | DBM Own Commission | 1.00% | ₹1200.00 | ₹30000.00 | ✅ PASS |
| Rank 13 (NBM) | Agent NBM | NBM Own Commission | 1.00% | ₹1200.00 | ₹31200.00 | ✅ PASS |
| Rank 14 (GM) | Agent GM | GM Own Commission | 1.00% | ₹1200.00 | ₹32400.00 | ✅ PASS |
| Rank 15 (CGM) | Agent CGM | CGM Own Commission | 1.00% | ₹1200.00 | ₹33600.00 | ✅ PASS |
| Rank 16 (VP) | Agent VP | VP Own Commission | 1.00% | ₹1200.00 | ₹34800.00 | ✅ PASS |
| Rank 17 (SVP) | Agent SVP | SVP Own Commission | 1.00% | ₹1200.00 | ₹36000.00 | ✅ PASS |
| Rank 18 (ED) | Agent ED | ED Own Commission | 1.00% | ₹1200.00 | ₹37200.00 | ✅ PASS |

**Total Commission Distributed:** ₹37200.00 (Expected: ₹37200.00)
**Total Percentage Distributed:** 31.00% (Expected: 31.00%)
**Final Status:** ✅ PASS

## Test 2 – Rank Compression (Bypassed: 3-7, 9-14, 16-17)

| Rank | Agent | Commission Type | % Allocated | Amount | Running Total | PASS/FAIL |
|---|---|---|---|---|---|---|
| Rank 1 (AO) | Agent AO | AO Commission (Direct) | 8.00% | ₹9600.00 | ₹9600.00 | ✅ PASS |
| Rank 2 (SAO) | Agent SAO | SAO Own Commission | 2.00% | ₹2400.00 | ₹12000.00 | ✅ PASS |
| Rank 8 (DO) | Agent SBM | DO Commission (Compressed) | 2.00% | ₹2400.00 | ₹14400.00 | ✅ PASS |
| Rank 8 (SDO) | Agent SBM | SDO Commission (Compressed) | 2.00% | ₹2400.00 | ₹16800.00 | ✅ PASS |
| Rank 8 (ADO) | Agent SBM | ADO Commission (Compressed) | 2.00% | ₹2400.00 | ₹19200.00 | ✅ PASS |
| Rank 8 (CADO) | Agent SBM | CADO Commission (Compressed) | 2.00% | ₹2400.00 | ₹21600.00 | ✅ PASS |
| Rank 8 (BM) | Agent SBM | BM Commission (Compressed) | 2.00% | ₹2400.00 | ₹24000.00 | ✅ PASS |
| Rank 8 (SBM) | Agent SBM | SBM Own Commission | 1.00% | ₹1200.00 | ₹25200.00 | ✅ PASS |
| Rank 15 (ABM) | Agent CGM | ABM Commission (Compressed) | 1.00% | ₹1200.00 | ₹26400.00 | ✅ PASS |
| Rank 15 (RBM) | Agent CGM | RBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹27600.00 | ✅ PASS |
| Rank 15 (ZBM) | Agent CGM | ZBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹28800.00 | ✅ PASS |
| Rank 15 (DBM) | Agent CGM | DBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹30000.00 | ✅ PASS |
| Rank 15 (NBM) | Agent CGM | NBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹31200.00 | ✅ PASS |
| Rank 15 (GM) | Agent CGM | GM Commission (Compressed) | 1.00% | ₹1200.00 | ₹32400.00 | ✅ PASS |
| Rank 15 (CGM) | Agent CGM | CGM Own Commission | 1.00% | ₹1200.00 | ₹33600.00 | ✅ PASS |
| Rank 18 (VP) | Agent ED | VP Commission (Compressed) | 1.00% | ₹1200.00 | ₹34800.00 | ✅ PASS |
| Rank 18 (SVP) | Agent ED | SVP Commission (Compressed) | 1.00% | ₹1200.00 | ₹36000.00 | ✅ PASS |
| Rank 18 (ED) | Agent ED | ED Own Commission | 1.00% | ₹1200.00 | ₹37200.00 | ✅ PASS |

**Total Commission Distributed:** ₹37200.00 (Expected: ₹37200.00)
**Total Percentage Distributed:** 31.00% (Expected: 31.00%)
**Final Status:** ✅ PASS

## Test 3 – Dynamic Commission Master (Rank 8 SBM updated to 22.5%)

| Rank | Agent | Commission Type | % Allocated | Amount | Running Total | PASS/FAIL |
|---|---|---|---|---|---|---|
| Rank 1 (AO) | Agent AO | AO Commission (Direct) | 8.00% | ₹9600.00 | ₹9600.00 | ✅ PASS |
| Rank 2 (SAO) | Agent SAO | SAO Own Commission | 2.00% | ₹2400.00 | ₹12000.00 | ✅ PASS |
| Rank 8 (DO) | Agent SBM | DO Commission (Compressed) | 2.00% | ₹2400.00 | ₹14400.00 | ✅ PASS |
| Rank 8 (SDO) | Agent SBM | SDO Commission (Compressed) | 2.00% | ₹2400.00 | ₹16800.00 | ✅ PASS |
| Rank 8 (ADO) | Agent SBM | ADO Commission (Compressed) | 2.00% | ₹2400.00 | ₹19200.00 | ✅ PASS |
| Rank 8 (CADO) | Agent SBM | CADO Commission (Compressed) | 2.00% | ₹2400.00 | ₹21600.00 | ✅ PASS |
| Rank 8 (BM) | Agent SBM | BM Commission (Compressed) | 2.00% | ₹2400.00 | ₹24000.00 | ✅ PASS |
| Rank 8 (SBM) | Agent SBM | SBM Own Commission | 2.50% | ₹3000.00 | ₹27000.00 | ✅ PASS |
| Rank 15 (RBM) | Agent CGM | RBM Commission (Compressed) | 0.50% | ₹600.00 | ₹27600.00 | ✅ PASS |
| Rank 15 (ZBM) | Agent CGM | ZBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹28800.00 | ✅ PASS |
| Rank 15 (DBM) | Agent CGM | DBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹30000.00 | ✅ PASS |
| Rank 15 (NBM) | Agent CGM | NBM Commission (Compressed) | 1.00% | ₹1200.00 | ₹31200.00 | ✅ PASS |
| Rank 15 (GM) | Agent CGM | GM Commission (Compressed) | 1.00% | ₹1200.00 | ₹32400.00 | ✅ PASS |
| Rank 15 (CGM) | Agent CGM | CGM Own Commission | 1.00% | ₹1200.00 | ₹33600.00 | ✅ PASS |
| Rank 18 (VP) | Agent ED | VP Commission (Compressed) | 1.00% | ₹1200.00 | ₹34800.00 | ✅ PASS |
| Rank 18 (SVP) | Agent ED | SVP Commission (Compressed) | 1.00% | ₹1200.00 | ₹36000.00 | ✅ PASS |
| Rank 18 (ED) | Agent ED | ED Own Commission | 1.00% | ₹1200.00 | ₹37200.00 | ✅ PASS |

**Total Commission Distributed:** ₹37200.00 (Expected: ₹37200.00)
**Total Percentage Distributed:** 31.00% (Expected: 31.00%)
**Final Status:** ✅ PASS

