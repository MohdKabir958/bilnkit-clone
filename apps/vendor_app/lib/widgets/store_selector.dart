import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../services/vendor_api_service.dart';
import '../session/session_controller.dart';

/// The server returns only this identity's approved stores. Switching rebuilds the queue/socket.
class StoreSelector extends StatefulWidget {
  const StoreSelector({super.key});
  @override
  State<StoreSelector> createState() => _StoreSelectorState();
}

class _StoreSelectorState extends State<StoreSelector> {
  bool _busy = false;
  Future<void> _choose() async {
    setState(() => _busy = true);
    try {
      final r = await http
          .get(Uri.parse('${ApiConfig.baseUrl}/v1/partner/stores'),
              headers: await VendorApiService.getAuthHeaders())
          .timeout(const Duration(seconds: 12));
      if (r.statusCode != 200) {
        throw Exception('Unable to load your approved stores.');
      }
      final data = jsonDecode(r.body)['data'] as List;
      if (!mounted) return;
      final id = await showModalBottomSheet<String>(
          context: context,
          builder: (ctx) => SafeArea(
                  child: ListView(shrinkWrap: true, children: [
                const ListTile(title: Text('Choose your store')),
                if (data.isEmpty)
                  const ListTile(
                      title:
                          Text('No approved stores linked to this account.')),
                for (final store in data)
                  ListTile(
                      title: Text(store['name'] as String),
                      subtitle: Text(store['address'] as String),
                      onTap: () => Navigator.pop(ctx, store['id'] as String))
              ])));
      if (id != null && mounted) {
        await SessionScope.maybeOf(context)?.selectStore(id);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Store selection could not be loaded. Please retry.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
      tooltip: 'Switch approved store',
      onPressed: _busy ? null : _choose,
      icon: const Icon(Icons.swap_horiz));
}
