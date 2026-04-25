const fs = require('fs');

const cities = [
  'Stockholm', 'Alingsås', 'Avesta', 'Bengtsfors', 'Boden', 'Bollnäs', 'Borlänge', 'Borås',
  'Eksjö', 'Enköping', 'Eskilstuna', 'Eslöv', 'Fagersta', 'Falkenberg', 'Falköping', 'Flen',
  'Filipstad', 'Gislaved', 'Gnosjö', 'Gällivare', 'Gävle', 'Göteborg', 'Halmstad', 'Haparanda',
  'Helsingborg', 'Hudiksvall', 'Hultsfred', 'Härnösand', 'Hässleholm', 'Högsby', 'Hörby',
  'Jokkmokk', 'Jönköping', 'Kalmar', 'Karlshamn', 'Karlskoga', 'Karlskrona', 'Karlstad',
  'Katrineholm', 'Kiruna', 'Kristianstad', 'Kristinehamn', 'Köping', 'Laholm', 'Landskrona',
  'Lessebo', 'Lidköping', 'Linköping', 'Ludvika', 'Luleå', 'Lund', 'Lysekil', 'Malmö',
  'Mariestad', 'Mellerud', 'Mjölby', 'Mora', 'Munkedal', 'Mönsterås', 'Märsta', 'Norrköping',
  'Norrtälje', 'Nybro', 'Nyköping', 'Nynäshamn', 'Nässjö', 'Oskarshamn', 'Oxelösund', 'Pajala',
  'Piteå', 'Ronneby', 'Sala', 'Simrishamn', 'Skara', 'Skellefteå', 'Skövde', 'Sollefteå',
  'Strängnäs', 'Sundsvall', 'Säffle', 'Sävsjö', 'Söderhamn', 'Södertälje', 'Sölvesborg',
  'Tierp', 'Torsby', 'Tranemo', 'Tranås', 'Trelleborg', 'Trollhättan', 'Uddevalla', 'Ulricehamn',
  'Umeå', 'Uppsala', 'Varberg', 'Vetlanda', 'Vimmerby', 'Visby', 'Vänersborg', 'Värnamo',
  'Västervik', 'Västerås', 'Växjö', 'Ystad', 'Åmål', 'Ängelholm', 'Örebro', 'Örnsköldsvik',
  'Östersund'
];

async function run() {
  const result = {};
  for (const city of cities) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ', Sweden')}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'PrayerApp-Script' } });
    const data = await res.json();
    if (data && data.length > 0) {
      result[city] = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      console.log(`Fetched ${city}: ${data[0].lat}, ${data[0].lon}`);
    } else {
      console.log(`Failed to fetch ${city}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.writeFileSync('src/providers/islamiskaForbundetCoords.json', JSON.stringify(result, null, 2));
}

run();
