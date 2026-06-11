import {
  ORDER_PAYMENT_SUBMITTED_NOTICE_TH,
  orderBookedNoticeTh,
  orderConfirmedNoticeTh,
  orderSystemNoticeForStatus,
} from '../templates.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

Deno.test('orderSystemNoticeForStatus returns one confirmed notice text', () => {
  const notice = orderSystemNoticeForStatus('confirmed', 'ตรวจสุขภาพพื้นฐาน', null);

  assertEquals(notice, orderConfirmedNoticeTh('ตรวจสุขภาพพื้นฐาน'));
});

Deno.test('orderSystemNoticeForStatus returns submitted notice from shared template', () => {
  assertEquals(orderSystemNoticeForStatus('submitted', 'ตรวจสุขภาพพื้นฐาน', null), ORDER_PAYMENT_SUBMITTED_NOTICE_TH);
});

Deno.test('orderBookedNoticeTh formats Bangkok booking time deterministically', () => {
  assertEquals(
    orderBookedNoticeTh('ตรวจสุขภาพพื้นฐาน', '2026-06-11T03:45:00Z'),
    'ยืนยันการจอง ตรวจสุขภาพพื้นฐาน วันที่ 2026-06-11 10:45 เรียบร้อยค่ะ',
  );
});

Deno.test('orderSystemNoticeForStatus returns null for non-notice transitions', () => {
  assertEquals(orderSystemNoticeForStatus('done', 'ตรวจสุขภาพพื้นฐาน', null), null);
  assertEquals(orderSystemNoticeForStatus('cancelled', 'ตรวจสุขภาพพื้นฐาน', null), null);
});
