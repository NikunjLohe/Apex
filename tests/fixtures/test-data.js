// =============================================================================
// tests/fixtures/test-data.js
// Central repository of all test data constants.
// =============================================================================

export const CREDENTIALS = {
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@apex.test',
    password: process.env.SUPER_ADMIN_PASSWORD || 'TestPass@2024!',
    label: 'Super Admin',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@apex.test',
    password: process.env.ADMIN_PASSWORD || 'TestPass@2024!',
    label: 'Admin',
  },
  manager: {
    email: process.env.MANAGER_EMAIL || 'manager@apex.test',
    password: process.env.MANAGER_PASSWORD || 'TestPass@2024!',
    label: 'Branch Manager',
  },
  agent: {
    email: process.env.AGENT_EMAIL || 'agent@apex.test',
    password: process.env.AGENT_PASSWORD || 'TestPass@2024!',
    label: 'Field Agent',
  },
}

export const ROUTES = {
  login:           '/login',
  dashboard:       '/dashboard',
  changePassword:  '/change-password',
  customers:       '/customers',
  customerNew:     '/customers/new',
  collectPayment:  '/payments/collect',
  collections:     '/reports/collections',
  defaulters:      '/reports/defaulters',
  maturities:      '/reports/maturities',
  myEarnings:      '/my-earnings',
  myDownline:      '/my-downline',
  cmdAwards:       '/cmd-awards',
  members:         '/admin/members',
  branches:        '/admin/branches',
  adminCustomers:  '/admin/customers',
  policies:        '/admin/policies',
  importData:      '/admin/import',
  importHistory:   '/admin/import/history',
  payouts:         '/admin/payouts',
  promotions:      '/admin/promotions',
  settings:        '/admin/settings',
  overview:        '/admin/overview',
  allReports:      '/admin/all-reports',
  systemLogs:      '/admin/logs',
  unauthorized:    '/unauthorized',
}

export const TEST_CUSTOMER = {
  name:             'Test Customer QA',
  dob:              '1990-06-15',
  gender:           'Male',
  phone:            '9876543210',
  email:            'testcustomer@qa.com',
  address1:         '123 Test Street',
  city:             'Mumbai',
  state:            'Maharashtra',
  pincode:          '400001',
  aadhaar:          '123456789012',
  pan:              'ABCDE1234F',
  nomineeName:      'Test Nominee',
  nomineeRelation:  'Spouse',
  nomineePhone:     '9876543211',
}

export const TEST_AGENT = {
  name:         'QA Test Agent',
  email:        `qa.agent.${Date.now()}@apex.test`,
  phone:        '9000000001',
  rankIndex:    0,           // index 0 in rank dropdown = first rank (AO)
  sponsorCode:  process.env.TEST_AGENT_SPONSOR_CODE || 'AG000001',
}

export const TEST_BRANCH = {
  name:    'QA Test Branch',
  address: '456 Branch Road',
  city:    'Pune',
  state:   'Maharashtra',
  email:   'qabranch@apex.test',
  phone:   '9111111111',
}

export const TEST_PLAN_RD = {
  type:          'RD',
  monthlyAmount: '1000',
  paymentDate:   '5',
}

export const TEST_PLAN_FD = {
  type:    'FD',
  fdAmount: '10000',
}

export const IMPORT_EXCEL_FIXTURE = 'tests/fixtures/sample-import.xlsx'

export const TIMEOUTS = {
  toast:      4_000,
  navigation: 10_000,
  table:      8_000,
  modal:      5_000,
}
