/**
 * GlucoCare - diabetes nutrition content (educational)
 * -------------------------------------------------------------
 * General, balanced guidance aligned with widely published advice from the
 * American Diabetes Association and WHO [R2][R1]. This is NOT a meal plan and
 * NOT a substitute for a registered dietitian. Nothing here is restrictive or
 * a "medical diet".
 */

export interface FoodGroup {
  title: string;
  intro: string;
  items: string[];
}

export const CHOOSE_OFTEN: FoodGroup = {
  title: "Choose more often",
  intro:
    "Foods that are higher in fibre and nutrients and have a gentler effect on blood glucose.",
  items: [
    "Non-starchy vegetables (leafy greens, beans, broccoli, peppers, tomato)",
    "Whole grains (whole wheat, brown rice, oats, millets)",
    "Whole fruit in sensible portions (berries, apple, citrus, guava)",
    "Pulses and legumes (dal, chickpeas, rajma, lentils)",
    "Nuts and seeds in small amounts",
    "Lean protein (fish, eggs, chicken, tofu, paneer, low-fat dairy)",
    "Water, unsweetened tea or coffee",
  ],
};

export const LIMIT: FoodGroup = {
  title: "Limit",
  intro:
    "Foods and drinks that can raise blood glucose quickly or add a lot of energy with little nutrition.",
  items: [
    "Sugary drinks (soft drinks, packaged juice, sweetened lassi)",
    "Sweets, desserts and refined-flour bakery items",
    "White bread, white rice and refined-flour foods in large amounts",
    "Deep-fried and heavily processed snacks",
    "Processed and cured meats",
    "Excess salt and high-sodium packaged foods",
  ],
};

export interface Concept {
  title: string;
  detail: string;
}

export const CONCEPTS: Concept[] = [
  {
    title: "The balanced plate",
    detail:
      "A simple guide: about half the plate non-starchy vegetables, a quarter whole grains or starchy foods, and a quarter protein. Add a small portion of fruit or dairy if desired.",
  },
  {
    title: "Carbohydrate awareness",
    detail:
      "Carbohydrates have the largest effect on blood glucose. Being consistent with portion sizes across meals, and choosing higher-fibre sources, helps keep levels steadier.",
  },
  {
    title: "Hydration",
    detail:
      "Water is the best default drink. Replacing one sugary drink a day with water is a small change with a real effect.",
  },
  {
    title: "Regular meals",
    detail:
      "Eating at fairly regular times and not skipping meals can make blood glucose easier to manage, especially for people on certain medications.",
  },
];

export const HEALTHY_SNACKS: string[] = [
  "A small handful of unsalted nuts",
  "Vegetable sticks with hummus or yoghurt dip",
  "A piece of whole fruit",
  "Plain yoghurt with berries",
  "Roasted chana (chickpeas)",
  "Boiled egg",
];
