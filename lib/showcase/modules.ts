import type { Href } from 'expo-router';

export type ShowcaseModuleId = 'referral' | 'admin' | 'ai-chat' | 'health-dashboard';

export type ShowcasePage = {
  badge: string;
  description: string;
  href: Href;
  label: string;
  path: string;
};

export type ShowcaseModule = {
  accent: string;
  body: string;
  eyebrow: string;
  id: ShowcaseModuleId;
  pages: ShowcasePage[];
  title: string;
};

export const showcaseModules: ShowcaseModule[] = [
  {
    accent: '#E9B44C',
    body: 'Referral links, partner-assisted orders, commission tracking, and payout review.',
    eyebrow: 'Growth engine',
    id: 'referral',
    pages: [
      {
        badge: 'Partner app',
        description: 'Partner workspace for assisted orders, buyer details, selected packages, and commission visibility.',
        href: '/partner',
        label: 'Partner Referral Workspace',
        path: '/partner',
      },
      {
        badge: 'Public entry',
        description: 'Sample referral landing link that stores a referral code before sending the customer into chat.',
        href: { pathname: '/r/[ref_code]', params: { ref_code: 'DRNOK2' } },
        label: 'Referral Link Entry',
        path: '/r/DRNOK2',
      },
      {
        badge: 'Admin',
        description: 'Admin surface for referrer profiles, commission schemes, and payout review.',
        href: '/admin/referrers',
        label: 'Referrers And Commissions',
        path: '/admin/referrers',
      },
    ],
    title: 'Referral Program',
  },
  {
    accent: '#3F8EFC',
    body: 'Product setup, product management, order queues, and booking operations.',
    eyebrow: 'Operations console',
    id: 'admin',
    pages: [
      {
        badge: 'Products',
        description: 'Create products, edit package copy, pricing, images, active state, and catalog metadata.',
        href: '/admin/catalog',
        label: 'Product Catalog Admin',
        path: '/admin/catalog',
      },
      {
        badge: 'Orders',
        description: 'Review submitted orders, payment status, booking actions, and customer chat/order context.',
        href: '/admin/orders',
        label: 'Orders Queue',
        path: '/admin/orders',
      },
      {
        badge: 'Partners',
        description: 'Manage referrers and commissions when the customer organization also runs partner sales.',
        href: '/admin/referrers',
        label: 'Referrer Admin',
        path: '/admin/referrers',
      },
    ],
    title: 'Admin Panel',
  },
  {
    accent: '#40C9A2',
    body: 'Health commerce chat, package recommendations, buyer details, and order state.',
    eyebrow: 'Customer assistant',
    id: 'ai-chat',
    pages: [
      {
        badge: 'Main demo',
        description: 'Live AI chat surface for health intent, product cards, RAG context, buyer info, and payment state.',
        href: '/chatbot',
        label: 'AI Chat',
        path: '/chatbot',
      },
      {
        badge: 'Product detail',
        description: 'Package detail page opened from product cards when a customer wants to inspect a package.',
        href: '/package-detail',
        label: 'Package Detail',
        path: '/package-detail',
      },
      {
        badge: 'Checkout',
        description: 'Checkout handoff that keeps orders connected to the chat commerce state machine.',
        href: '/checkout',
        label: 'Checkout Handoff',
        path: '/checkout',
      },
      {
        badge: 'Status',
        description: 'Order status view for customer and admin handoff after payment or booking actions.',
        href: '/order-status',
        label: 'Order Status',
        path: '/order-status',
      },
    ],
    title: 'AI Chat',
  },
  {
    accent: '#F26D6D',
    body: 'Patient-facing health overview, lab results, wearable trends, and profile memory.',
    eyebrow: 'Health intelligence',
    id: 'health-dashboard',
    pages: [
      {
        badge: 'Overview',
        description: 'Primary health dashboard with body overview, health facts, and insight summary.',
        href: '/health',
        label: 'Health Dashboard',
        path: '/health',
      },
      {
        badge: 'Body',
        description: 'Standalone body overview route for demoing the same health summary outside the tab shell.',
        href: '/body-overview',
        label: 'Body Overview',
        path: '/body-overview',
      },
      {
        badge: 'Labs',
        description: 'Health check result page for lab markers, confidence review, and confirmed result context.',
        href: '/health-check-results',
        label: 'Health Check Results',
        path: '/health-check-results',
      },
      {
        badge: 'Wearables',
        description: 'Wearable trend page for movement, sleep, and recent signal tracking.',
        href: '/wearable-health',
        label: 'Wearable Health',
        path: '/wearable-health',
      },
      {
        badge: 'Profile',
        description: 'User profile surface for consent, confirmed health facts, saved memory, and export controls.',
        href: '/user-profile',
        label: 'User Profile',
        path: '/user-profile',
      },
    ],
    title: 'Health Dashboard',
  },
];

export function findShowcaseModule(id: string | string[] | undefined) {
  const moduleId = Array.isArray(id) ? id[0] : id;

  return showcaseModules.find((item) => item.id === moduleId) ?? null;
}
