export type DestinationType = 'Mer' | 'Nature' | 'Culture' | 'Gastronomie';
export type DestinationSeason = 'printemps' | 'ete' | 'automne' | 'hiver';

export type Destination = {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  types: DestinationType[];
  seasons: DestinationSeason[];
  idea: string;
  events: { name: string; months: number[] }[];
};

export const DESTINATIONS: Destination[] = [
  {
    name: 'Saint-Malo',
    region: 'Bretagne',
    latitude: 48.6493,
    longitude: -2.0257,
    types: ['Mer', 'Nature'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Remparts, plages et sentier côtier.',
    events: [{ name: 'Grandes marées', months: [3, 4, 9, 10] }],
  },
  {
    name: 'Biarritz',
    region: 'Pays basque',
    latitude: 43.4832,
    longitude: -1.5586,
    types: ['Mer', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Promenade sur la côte et découverte des halles.',
    events: [
      { name: 'Fêtes de Bayonne', months: [7] },
      { name: 'Festival de Biarritz', months: [9] },
    ],
  },
  {
    name: 'Annecy',
    region: 'Alpes',
    latitude: 45.8992,
    longitude: 6.1294,
    types: ['Nature', 'Culture'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Tour du lac, vieille ville et voies vertes.',
    events: [{ name: 'Fête du Lac', months: [8] }],
  },
  {
    name: 'Gorges du Verdon',
    region: 'Provence',
    latitude: 43.7497,
    longitude: 6.3286,
    types: ['Nature'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Belvédères, randonnées et villages provençaux.',
    events: [{ name: 'Fête de la lavande', months: [7, 8] }],
  },
  {
    name: 'Avignon',
    region: 'Provence',
    latitude: 43.9493,
    longitude: 4.8055,
    types: ['Culture', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Palais des Papes, ruelles historiques et marchés.',
    events: [{ name: 'Festival d’Avignon', months: [7] }],
  },
  {
    name: 'Dijon',
    region: 'Bourgogne',
    latitude: 47.322,
    longitude: 5.0415,
    types: ['Culture', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne', 'hiver'],
    idea: 'Parcours de la Chouette et haltes gourmandes.',
    events: [{ name: 'Foire internationale et gastronomique', months: [10, 11] }],
  },
  {
    name: 'Strasbourg',
    region: 'Alsace',
    latitude: 48.5734,
    longitude: 7.7521,
    types: ['Culture', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne', 'hiver'],
    idea: 'Petite France, cathédrale et winstubs.',
    events: [{ name: 'Marchés de Noël', months: [11, 12] }],
  },
  {
    name: 'Colmar',
    region: 'Alsace',
    latitude: 48.0794,
    longitude: 7.3585,
    types: ['Culture', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne', 'hiver'],
    idea: 'Canaux de la Petite Venise et villages viticoles.',
    events: [{ name: 'Marchés de Noël', months: [11, 12] }],
  },
  {
    name: 'Marseille',
    region: 'Provence',
    latitude: 43.2965,
    longitude: 5.3698,
    types: ['Mer', 'Nature', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Vieux-Port, calanques et cuisine méditerranéenne.',
    events: [{ name: 'Festival de Marseille', months: [6] }],
  },
  {
    name: 'Bordeaux',
    region: 'Nouvelle-Aquitaine',
    latitude: 44.8378,
    longitude: -0.5792,
    types: ['Culture', 'Gastronomie'],
    seasons: ['printemps', 'ete', 'automne'],
    idea: 'Quais, cité du vin et escapade dans le vignoble.',
    events: [{ name: 'Bordeaux fête le vin', months: [6] }],
  },
];

export function getSeason(month: number): DestinationSeason {
  if (month >= 3 && month <= 5) return 'printemps';
  if (month >= 6 && month <= 8) return 'ete';
  if (month >= 9 && month <= 11) return 'automne';
  return 'hiver';
}
