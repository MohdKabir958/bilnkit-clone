import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class StoreCategory {
  const StoreCategory(this.id, this.name, [this.hindi = '']);
  final String id;
  final String name;
  final String hindi;
}

/// Only server-managed, active store categories. Never invent category identifiers.
Future<List<StoreCategory>> loadStoreCategories() async {
  final response = await http
      .get(Uri.parse('${ApiConfig.baseUrl}/categories?for=restaurants'))
      .timeout(const Duration(seconds: 12));
  if (response.statusCode != 200) {
    throw Exception('Could not load store categories.');
  }
  final body = jsonDecode(response.body) as Map<String, dynamic>;
  final rows = body['data'] as List;
  return rows
      .map((row) => StoreCategory(row['id'] as String, row['name'] as String,
          row['nameHi'] as String? ?? ''))
      .toList();
}
