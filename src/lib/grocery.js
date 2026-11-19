const RULES = [
  ['Frozen', /\b(frozen|ice cream|popsicle|waffle)/i],
  ['Produce', /\b(apple|banana|berr|lettuce|romaine|spinach|kale|tomato|onion|garlic|potato|carrot|celery|pepper|cucumber|avocado|lime|lemon|orange|grape|cilantro|parsley|basil|broccoli|asparagus|zucchini|squash|mushroom|corn on|fruit|salad|herb|ginger|jalape|cabbage|green bean|melon|peach|pear)/i],
  ['Meat & Seafood', /\b(beef|chicken|turkey|pork|bacon|sausage|ham|steak|salmon|shrimp|fish|tuna|meatball|ground|thigh|breast|ribs|hot dog)/i],
  ['Dairy & Eggs', /\b(milk|cheese|cheddar|parmesan|mozzarella|yogurt|butter|egg|cream|sour cream|cottage)/i],
  ['Bakery', /\b(bread|bun|bagel|tortilla|roll|muffin|croissant|pita|naan)/i],
  ['Drinks', /\b(juice|soda|water|gatorade|coffee|tea|sparkling|lemonade|beer|wine)/i],
  ['Household', /\b(paper towel|toilet|tissue|soap|detergent|trash bag|foil|wrap|sponge|shampoo|toothpaste|batter(y|ies)|napkin|dish)/i],
  ['Pantry', /\b(rice|pasta|spaghetti|noodle|flour|sugar|oil|vinegar|sauce|salsa|seasoning|spice|salt|pepper flakes|cereal|oat|beans|can|soup|peanut|honey|syrup|mix|chips|crackers|dressing|ketchup|mustard|mayo|broth|snack)/i],
];

export function guessSection(text) {
  for (const [sec, re] of RULES) if (re.test(text)) return sec;
  return 'Other';
}

export function normalizeItem(s) {
  return s.toLowerCase().replace(/^[\d\s./½¼¾]+(lb|lbs|oz|cups?|tbsp|tsp|g|kg|pk|pack|cans?|bags?)?\s+/i, '').trim();
}

export function tidyItem(t) {
  t = t.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
