/// Display departments group the backend's product categories. They never create catalog records.
class GroceryDepartment {
  const GroceryDepartment(this.label, this.sprite, this.aliases);
  final String label;
  final int sprite;
  final List<String> aliases;
  bool matches(String category) =>
      aliases.any((alias) => category.toLowerCase().contains(alias));
  static const all = [
    GroceryDepartment(
        'Fruits & Vegetables', 0, ['fruit', 'vegetable', 'produce']),
    GroceryDepartment('Dairy & Eggs', 1, ['dairy', 'egg', 'milk']),
    GroceryDepartment('Grains & Staples', 2,
        ['grain', 'staple', 'rice', 'flour', 'pulse', 'cooking']),
    GroceryDepartment('Snacks & Beverages', 3,
        ['snack', 'beverage', 'biscuit', 'drink', 'tea', 'coffee']),
    GroceryDepartment(
        'Personal Care', 4, ['personal', 'cosmetic', 'beauty', 'hygiene']),
    GroceryDepartment(
        'Home & Kitchen', 5, ['home', 'household', 'clean', 'kitchen']),
    GroceryDepartment('Bakery', 6, ['bakery', 'bread', 'breakfast']),
    GroceryDepartment('Meat & Fish', 7, ['meat', 'fish', 'chicken', 'seafood']),
    GroceryDepartment('Frozen Foods', 8, ['frozen', 'ice cream']),
    GroceryDepartment('Others', 9, []),
  ];
  bool includes(String category) => sprite == 9
      ? !all.take(9).any((d) => d.matches(category))
      : matches(category);
}
