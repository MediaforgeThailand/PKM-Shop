function tlv(id: string, value: string) {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function crc16Ccitt(payload: string) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function normalizePromptPayId(idOrPhone: string) {
  const digits = idOrPhone.replace(/\D/g, '');

  if (digits.length === 10 && digits.startsWith('0')) {
    return {
      id: '01',
      value: `0066${digits.slice(1)}`,
    };
  }

  if (digits.length === 13) {
    return {
      id: '02',
      value: digits,
    };
  }

  throw new Error('PromptPay id must be a Thai phone number or 13-digit national id.');
}

export function buildPromptPayPayload(idOrPhone: string, amountBaht: number): string {
  if (!Number.isInteger(amountBaht) || amountBaht <= 0) {
    throw new Error('amountBaht must be a positive integer.');
  }

  const proxy = normalizePromptPayId(idOrPhone);
  const merchantAccount = tlv('00', 'A000000677010111') + tlv(proxy.id, proxy.value);
  const payloadWithoutCrc = [
    tlv('00', '01'),
    tlv('01', '11'),
    tlv('29', merchantAccount),
    tlv('53', '764'),
    tlv('54', amountBaht.toFixed(2)),
    tlv('58', 'TH'),
    '6304',
  ].join('');

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}
