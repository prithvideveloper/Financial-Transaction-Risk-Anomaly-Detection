export interface MccOption {
  code: string;
  name: string;
  riskTier: "normal" | "elevated" | "high";
}

export const MCC_OPTIONS: MccOption[] = [
  { code: "4829", name: "Money Transfer (Wire / P2P)", riskTier: "high" },
  { code: "7801", name: "Internet Gambling & Betting", riskTier: "high" },
  { code: "7995", name: "Betting & Casino Gaming", riskTier: "high" },
  { code: "6051", name: "Quasi Cash / Crypto / Foreign Currency", riskTier: "high" },
  { code: "5944", name: "Jewelry Stores & Watches", riskTier: "high" },
  { code: "5094", name: "Precious Stones and Metals", riskTier: "high" },
  { code: "4722", name: "Travel Agencies & Tour Operators", riskTier: "elevated" },
  { code: "7996", name: "Amusement Parks & Carnivals", riskTier: "elevated" },
  { code: "5813", name: "Drinking Places (Nightclubs & Bars)", riskTier: "elevated" },
  { code: "3780", name: "Computer Network Services", riskTier: "elevated" },
  { code: "5311", name: "Department Stores", riskTier: "normal" },
  { code: "5411", name: "Grocery Stores, Supermarkets", riskTier: "normal" },
  { code: "5541", name: "Service Stations (Gas)", riskTier: "normal" },
  { code: "5812", name: "Eating Places and Restaurants", riskTier: "normal" },
  { code: "5814", name: "Fast Food Restaurants", riskTier: "normal" },
  { code: "5912", name: "Drug Stores and Pharmacies", riskTier: "normal" },
  { code: "5661", name: "Shoe Stores", riskTier: "normal" },
  { code: "5719", name: "Miscellaneous Home Furnishing Stores", riskTier: "normal" },
  { code: "5815", name: "Digital Goods - Media, Books, Apps", riskTier: "normal" },
  { code: "4121", name: "Taxicabs and Limousines (Rideshare)", riskTier: "normal" },
  { code: "4900", name: "Utilities - Electric, Gas, Water", riskTier: "normal" },
  { code: "5300", name: "Wholesale Clubs (Costco, Sam's)", riskTier: "normal" },
  { code: "8099", name: "Medical Services & Clinics", riskTier: "normal" },
  { code: "7538", name: "Automotive Service Shops", riskTier: "normal" }
];
