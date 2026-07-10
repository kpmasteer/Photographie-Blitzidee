export const isoToday = () => new Date().toISOString().slice(0, 10);

export const formatDate = (iso?: string) => iso ? new Intl.DateTimeFormat("de-DE").format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : "–";

export const addDays = (iso: string, days: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const excelSerialToIso = (serial: number) => {
  const millis = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(millis).toISOString().slice(0, 10);
};
