const d = new Date();

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formattedDate = formatter.format(d);
console.log("formattedDate:", formattedDate);

const start = new Date(`${formattedDate}T00:00:00+05:30`);
console.log("startOfDay:", start.toISOString());

const end = new Date(`${formattedDate}T23:59:59.999+05:30`);
console.log("endOfDay:", end.toISOString());
