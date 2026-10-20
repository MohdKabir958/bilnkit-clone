import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../models/delivery_address.dart';
import '../services/address_api.dart';

class AddressesScreen extends StatefulWidget {
  const AddressesScreen({super.key});
  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  List<DeliveryAddress>? _addresses;
  String? _error;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await AddressApi.list();
      if (mounted) {
        setState(() {
          _addresses = rows;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _select(DeliveryAddress a) async {
    setState(() => _busy = true);
    try {
      final selected =
          await AddressApi.save(a.toWrite(isDefault: true), id: a.id);
      if (mounted) Navigator.pop(context, selected);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _busy = false;
        });
      }
    }
  }

  Future<void> _edit([DeliveryAddress? a]) async {
    final saved = await Navigator.push<DeliveryAddress>(
        context, MaterialPageRoute(builder: (_) => _AddressForm(existing: a)));
    if (!mounted) return;
    if (saved != null) {
      Navigator.pop(context, saved);
    } else {
      await _load();
    }
  }

  Future<void> _delete(DeliveryAddress a) async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('Delete address?'),
                content: Text(a.formatted),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('Keep')),
                  TextButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('Delete'))
                ]));
    if (yes != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await AddressApi.delete(a.id);
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Delivery addresses')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text(
              'Select an address to see stores that deliver there. A saved address does not guarantee delivery coverage.'),
          if (_error != null) ...[
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            TextButton(onPressed: _load, child: const Text('Try again'))
          ],
          if (_addresses == null && _error == null)
            const Center(child: CircularProgressIndicator()),
          for (final a in _addresses ?? <DeliveryAddress>[])
            Card(
                child: Column(children: [
              ListTile(
                  title: Text('${a.label}${a.isDefault ? ' · Selected' : ''}'),
                  subtitle: Text(a.formatted),
                  onTap: _busy ? null : () => _select(a)),
              Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                TextButton(
                    onPressed: _busy ? null : () => _edit(a),
                    child: const Text('Edit')),
                TextButton(
                    onPressed: _busy ? null : () => _delete(a),
                    child: const Text('Delete'))
              ]),
            ])),
          FilledButton.icon(
              onPressed: _busy ? null : () => _edit(),
              icon: const Icon(Icons.add_location_alt_outlined),
              label: const Text('Add address')),
        ]),
      );
}

class _AddressForm extends StatefulWidget {
  const _AddressForm({this.existing});
  final DeliveryAddress? existing;
  @override
  State<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends State<_AddressForm> {
  final _form = GlobalKey<FormState>();
  final Map<String, TextEditingController> _fields = {};
  List<Map<String, dynamic>> _cities = [];
  String? _cityId, _error;
  bool _saving = false, _locating = false;
  final _searchQuery = TextEditingController();
  List<Map<String, dynamic>> _suggestions = [];
  Future<void> _search() async {
    setState(() {
      _locating = true;
      _error = null;
      _suggestions = [];
    });
    try {
      final result = await AddressApi.call('GET',
          'maps/search?q=${Uri.encodeQueryComponent(_searchQuery.text.trim())}');
      if (mounted) {
        setState(() => _suggestions = (result['data'] as List)
            .map((r) => Map<String, dynamic>.from(r))
            .toList());
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
    if (mounted) setState(() => _locating = false);
  }

  static const _labels = {
    'label': 'Label (Home, Work)',
    'houseNumber': 'House / flat number',
    'street': 'Building / street',
    'locality': 'Area / locality',
    'pinCode': 'Six-digit PIN code',
    'landmark': 'Landmark (optional)',
    'instructions': 'Delivery instructions (optional)',
    'lat': 'Latitude',
    'lng': 'Longitude'
  };
  @override
  void initState() {
    super.initState();
    for (final key in _labels.keys) {
      _fields[key] = TextEditingController(
          text: widget.existing?.data[key]?.toString() ??
              (key == 'label' ? 'Home' : ''));
    }
    _cityId = widget.existing?.data['cityId'] as String?;
    _loadCities();
  }

  Future<void> _loadCities() async {
    try {
      final rows = await AddressApi.cities();
      if (mounted) {
        setState(() {
          _cities = rows;
          if (!rows.any((c) => c['id'] == _cityId)) _cityId = null;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _gps() async {
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw Exception(
            'Turn on device location or enter the coordinates manually.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception(
            'Location permission is unavailable. You can still enter an address manually.');
      }
      final p = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 15));
      if (!mounted) return;
      _fields['lat']!.text = p.latitude.toStringAsFixed(6);
      _fields['lng']!.text = p.longitude.toStringAsFixed(6);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
    if (mounted) setState(() => _locating = false);
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final data = <String, dynamic>{
        for (final e in _fields.entries) e.key: e.value.text.trim(),
        'country': 'IN',
        'cityId': _cityId,
        'isDefault': true
      };
      data['lat'] = double.parse(_fields['lat']!.text);
      data['lng'] = double.parse(_fields['lng']!.text);
      final saved = await AddressApi.save(data, id: widget.existing?.id);
      if (mounted) Navigator.pop(context, saved);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  void dispose() {
    _searchQuery.dispose();
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: Text(widget.existing == null
              ? 'Add delivery address'
              : 'Edit delivery address')),
      body: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            const Text(
                'India · Choose an enabled city. GPS fills coordinates once; it does not share continuous location. Confirm the complete address before saving.'),
            TextField(
                controller: _searchQuery,
                enabled: !_saving && !_locating,
                decoration: const InputDecoration(
                    labelText: 'Search for a place (optional)')),
            TextButton(
                onPressed: _saving || _locating ? null : _search,
                child: const Text('Search locations')),
            for (final place in _suggestions)
              ListTile(
                  title: Text(place['label'] as String),
                  onTap: _saving
                      ? null
                      : () {
                          _fields['lat']!.text = '${place['lat']}';
                          _fields['lng']!.text = '${place['lng']}';
                          if (_fields['pinCode']!.text.isEmpty &&
                              place['pinCode'] != null) {
                            _fields['pinCode']!.text = '${place['pinCode']}';
                          }
                          setState(() => _suggestions = []);
                        }),
            if (_error != null)
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_cities.isEmpty)
              TextButton(
                  onPressed: _loadCities,
                  child: const Text('Reload enabled cities')),
            DropdownButtonFormField<String>(
                initialValue: _cityId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'City and state'),
                items: _cities
                    .map((c) => DropdownMenuItem(
                        value: c['id'] as String,
                        child: Text('${c['name']}, ${c['state']}',
                            overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: _saving ? null : (v) => setState(() => _cityId = v),
                validator: (v) => v == null ? 'Choose an enabled city' : null),
            for (final entry in _labels.entries)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: TextFormField(
                    controller: _fields[entry.key],
                    enabled: !_saving,
                    decoration: InputDecoration(labelText: entry.value),
                    maxLength: entry.key == 'instructions'
                        ? 300
                        : entry.key == 'pinCode'
                            ? 6
                            : 140,
                    keyboardType: ['lat', 'lng'].contains(entry.key)
                        ? const TextInputType.numberWithOptions(
                            decimal: true, signed: true)
                        : entry.key == 'pinCode'
                            ? TextInputType.number
                            : TextInputType.text,
                    validator: (v) {
                      if (['landmark', 'instructions'].contains(entry.key)) {
                        return null;
                      }
                      if (v == null || v.trim().isEmpty) return 'Required';
                      if (entry.key == 'pinCode' &&
                          !RegExp(r'^[1-9]\d{5}$').hasMatch(v)) {
                        return 'Enter a six-digit PIN code';
                      }
                      if (['lat', 'lng'].contains(entry.key) &&
                          (double.tryParse(v) == null ||
                              !double.parse(v).isFinite)) {
                        return 'Enter a valid coordinate';
                      }
                      return null;
                    },
                  )),
            OutlinedButton.icon(
                onPressed: _saving || _locating ? null : _gps,
                icon: const Icon(Icons.my_location),
                label: Text(_locating
                    ? 'Reading location…'
                    : 'Use my current GPS location')),
            const SizedBox(height: 12),
            FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? 'Saving…' : 'Save and select address')),
          ])));
}
