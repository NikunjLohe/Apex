/**
 * Commission Engine Verification Script
 * Validates that commission rates are fully dynamic and sourced
 * solely from the Commission Master configuration without hardcoding.
 */
import { calculateCommissions } from '../src/lib/commissionEngine.js';

// Setup Mock Data
const mockRanksList = [
  { rank: 1, code: 'AO', name: 'Administrative Officer' },
  { rank: 2, code: 'AM', name: 'Assistant Manager' },
  { rank: 3, code: 'ADM', name: 'Admin Division Manager' },
];

const mockAgentAO = {
  id: 'agent_ao_123',
  name: 'Alok Pandey',
  rank: 1,
  sponsorCode: 'AG1008',
  referredBy: 'agent_am_456'
};

const mockAgentAM = {
  id: 'agent_am_456',
  name: 'Gaurav Jain',
  rank: 2,
  sponsorCode: 'AG1000',
  referredBy: null
};

const mockUsersMap = {
  'agent_ao_123': mockAgentAO,
  'agent_am_456': mockAgentAM
};

const mockCustomer = {
  id: 'cust_999',
  name: 'Rahul Verma',
  account: 'CUST2001'
};

const mockPolicyInfo = {
  id: 'pol_999',
  number: 'POL2001'
};

const mockPlan = {
  planCode: 'RD1Y',
  planType: 'RD',
  policyYear: 1
};

// Business amount for calculation (e.g., 1000 monthly * 12 = 12000 base)
const businessAmount = 12000;

function runVerification() {
  console.log('================================================================');
  console.log('       COMMISSION ENGINE DYNAMIC CONFIGURATION TEST REPORT      ');
  console.log('================================================================\n');

  let overallPass = true;

  // --- TEST 1: Set AO commission to 8% ---
  const config1 = {
    'RD1Y': {
      1: {
        'AO': 8,
        'AM': 12
      }
    }
  };
  
  console.log('TEST 1: Setting AO rate to 8%...');
  const results1 = calculateCommissions({
    businessAmount,
    plan: mockPlan,
    baseAgent: mockAgentAO,
    usersMap: mockUsersMap,
    commissionMaster: config1,
    ranksList: mockRanksList,
    customer: mockCustomer,
    policyInfo: mockPolicyInfo,
    monthNum: 7,
    yearNum: 2026
  });

  const aoComm1 = results1.find(c => c.agentId === mockAgentAO.id);
  const amComm1 = results1.find(c => c.agentId === mockAgentAM.id);

  console.log(`- AO calculated percentage: ${aoComm1?.percentage}% (Expected: 8%)`);
  console.log(`- AO calculated amount: ₹${aoComm1?.amount} (Expected: ₹960)`);
  console.log(`- AM calculated percentage: ${amComm1?.percentage}% (Expected: 4% [12% - 8%])`);
  console.log(`- AM calculated amount: ₹${amComm1?.amount} (Expected: ₹480)`);

  const t1_ao_pass = aoComm1 && Math.abs(aoComm1.percentage - 8) < 0.0001 && Math.abs(aoComm1.amount - 960) < 0.0001;
  const t1_am_pass = amComm1 && Math.abs(amComm1.percentage - 4) < 0.0001 && Math.abs(amComm1.amount - 480) < 0.0001;
  
  if (t1_ao_pass && t1_am_pass) {
    console.log('Result: ✅ PASS\n');
  } else {
    console.log('Result: ❌ FAIL\n');
    overallPass = false;
  }

  // --- TEST 2: Change AO commission to 9% ---
  const config2 = {
    'RD1Y': {
      1: {
        'AO': 9,
        'AM': 12
      }
    }
  };

  console.log('TEST 2: Changing AO rate to 9%...');
  const results2 = calculateCommissions({
    businessAmount,
    plan: mockPlan,
    baseAgent: mockAgentAO,
    usersMap: mockUsersMap,
    commissionMaster: config2,
    ranksList: mockRanksList,
    customer: mockCustomer,
    policyInfo: mockPolicyInfo,
    monthNum: 7,
    yearNum: 2026
  });

  const aoComm2 = results2.find(c => c.agentId === mockAgentAO.id);
  const amComm2 = results2.find(c => c.agentId === mockAgentAM.id);

  console.log(`- AO calculated percentage: ${aoComm2?.percentage}% (Expected: 9%)`);
  console.log(`- AO calculated amount: ₹${aoComm2?.amount} (Expected: ₹1080)`);
  console.log(`- AM calculated percentage: ${amComm2?.percentage}% (Expected: 3% [12% - 9%])`);
  console.log(`- AM calculated amount: ₹${amComm2?.amount} (Expected: ₹360)`);

  const t2_ao_pass = aoComm2 && Math.abs(aoComm2.percentage - 9) < 0.0001 && Math.abs(aoComm2.amount - 1080) < 0.0001;
  const t2_am_pass = amComm2 && Math.abs(amComm2.percentage - 3) < 0.0001 && Math.abs(amComm2.amount - 360) < 0.0001;

  if (t2_ao_pass && t2_am_pass) {
    console.log('Result: ✅ PASS\n');
  } else {
    console.log('Result: ❌ FAIL\n');
    overallPass = false;
  }

  // --- TEST 3: Change AM commission to 14% ---
  const config3 = {
    'RD1Y': {
      1: {
        'AO': 9,
        'AM': 14
      }
    }
  };

  console.log('TEST 3: Setting AM rate to 14% (higher rank validation)...');
  const results3 = calculateCommissions({
    businessAmount,
    plan: mockPlan,
    baseAgent: mockAgentAO,
    usersMap: mockUsersMap,
    commissionMaster: config3,
    ranksList: mockRanksList,
    customer: mockCustomer,
    policyInfo: mockPolicyInfo,
    monthNum: 7,
    yearNum: 2026
  });

  const aoComm3 = results3.find(c => c.agentId === mockAgentAO.id);
  const amComm3 = results3.find(c => c.agentId === mockAgentAM.id);

  console.log(`- AO calculated percentage: ${aoComm3?.percentage}% (Expected: 9%)`);
  console.log(`- AO calculated amount: ₹${aoComm3?.amount} (Expected: ₹1080)`);
  console.log(`- AM calculated percentage: ${amComm3?.percentage}% (Expected: 5% [14% - 9%])`);
  console.log(`- AM calculated amount: ₹${amComm3?.amount} (Expected: ₹600)`);

  const t3_ao_pass = aoComm3 && Math.abs(aoComm3.percentage - 9) < 0.0001 && Math.abs(aoComm3.amount - 1080) < 0.0001;
  const t3_am_pass = amComm3 && Math.abs(amComm3.percentage - 5) < 0.0001 && Math.abs(amComm3.amount - 600) < 0.0001;

  if (t3_ao_pass && t3_am_pass) {
    console.log('Result: ✅ PASS\n');
  } else {
    console.log('Result: ❌ FAIL\n');
    overallPass = false;
  }

  console.log('================================================================');
  console.log(`FINAL REPORT: ${overallPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('The Commission Master is the SINGLE SOURCE OF TRUTH.');
  console.log('================================================================');
}

runVerification();
