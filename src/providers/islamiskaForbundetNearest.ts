import coords from './islamiskaForbundetCoords.json';

type CityCoords = { lat: number; lng: number };
const cityCoords = coords as Record<string, CityCoords>;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getNearestIslamiskaForbundetCity(latitude: number, longitude: number): string {
  let nearestCity = 'Stockholm';
  let minDistance = Infinity;

  for (const [city, c] of Object.entries(cityCoords)) {
    const d = haversineDistance(latitude, longitude, c.lat, c.lng);
    if (d < minDistance) {
      minDistance = d;
      nearestCity = city;
    }
  }

  return nearestCity;
}
