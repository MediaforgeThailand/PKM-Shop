export type HospitalDirectoryItem = {
  address: string;
  id: string;
  lat: number;
  lng: number;
  mapQuery: string;
  name: string;
  serviceArea: string;
};

export const partnerHospitalDirectory: HospitalDirectoryItem[] = [
  {
    address: '33 Sukhumvit 3, Khlong Toei Nuea, Watthana, Bangkok',
    id: 'hospital-bumrungrad',
    lat: 13.7467,
    lng: 100.5528,
    mapQuery: 'Bumrungrad International Hospital Bangkok',
    name: 'Bumrungrad International Hospital',
    serviceArea: 'Bangkok - Sukhumvit',
  },
  {
    address: '2 Soi Soonvijai 7, New Petchburi Road, Huai Khwang, Bangkok',
    id: 'hospital-bangkok',
    lat: 13.7489,
    lng: 100.5831,
    mapQuery: 'Bangkok Hospital Headquarters',
    name: 'Bangkok Hospital',
    serviceArea: 'Bangkok - Huai Khwang',
  },
  {
    address: '133 Sukhumvit 49, Khlong Tan Nuea, Watthana, Bangkok',
    id: 'hospital-samitivej-sukhumvit',
    lat: 13.7345,
    lng: 100.5769,
    mapQuery: 'Samitivej Sukhumvit Hospital',
    name: 'Samitivej Sukhumvit Hospital',
    serviceArea: 'Bangkok - Sukhumvit',
  },
  {
    address: '3333 Rama IV Road, Khlong Toei, Bangkok',
    id: 'hospital-medpark',
    lat: 13.7227,
    lng: 100.5583,
    mapQuery: 'MedPark Hospital Bangkok',
    name: 'MedPark Hospital',
    serviceArea: 'Bangkok - Rama IV',
  },
  {
    address: '9/1 Convent Road, Silom, Bang Rak, Bangkok',
    id: 'hospital-bnh',
    lat: 13.7249,
    lng: 100.5353,
    mapQuery: 'BNH Hospital Bangkok',
    name: 'BNH Hospital',
    serviceArea: 'Bangkok - Silom',
  },
  {
    address: '2 Wang Lang Road, Bangkok Noi, Bangkok',
    id: 'hospital-siriraj',
    lat: 13.7588,
    lng: 100.4859,
    mapQuery: 'Siriraj Hospital Bangkok',
    name: 'Siriraj Hospital',
    serviceArea: 'Bangkok Noi',
  },
  {
    address: '1873 Rama IV Road, Pathum Wan, Bangkok',
    id: 'hospital-chula',
    lat: 13.7312,
    lng: 100.5351,
    mapQuery: 'King Chulalongkorn Memorial Hospital',
    name: 'King Chulalongkorn Memorial Hospital',
    serviceArea: 'Bangkok - Pathum Wan',
  },
  {
    address: '270 Rama VI Road, Ratchathewi, Bangkok',
    id: 'hospital-ramathibodi',
    lat: 13.7649,
    lng: 100.5266,
    mapQuery: 'Ramathibodi Hospital Bangkok',
    name: 'Ramathibodi Hospital',
    serviceArea: 'Bangkok - Ratchathewi',
  },
  {
    address: 'Demo hospital address for marketplace testing',
    id: 'hospital-mira-partner',
    lat: 13.7563,
    lng: 100.5018,
    mapQuery: 'Bangkok Thailand',
    name: 'Mira Partner Hospital',
    serviceArea: 'Demo location',
  },
];

export function findHospitalByName(name: string) {
  return partnerHospitalDirectory.find((hospital) => hospital.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

export function filterHospitals(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return partnerHospitalDirectory;
  }

  return partnerHospitalDirectory.filter((hospital) =>
    [hospital.name, hospital.address, hospital.serviceArea]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  );
}
