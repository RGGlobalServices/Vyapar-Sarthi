const dates = [
  new Date(),
  new Date("2026-07-22"),
  new Date("2026-07-22T15:00:00.000Z")
];

function getISTStart(d) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedDate = formatter.format(d);
  return new Date(`${formattedDate}T00:00:00+05:30`);
}

function getISTEnd(d) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedDate = formatter.format(d);
  return new Date(`${formattedDate}T23:59:59.999+05:30`);
}

dates.forEach(d => {
  console.log("Input:", d.toISOString());
  console.log("Start:", getISTStart(d).toISOString());
  console.log("End  :", getISTEnd(d).toISOString());
  console.log("---");
});
