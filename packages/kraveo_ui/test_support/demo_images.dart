// Test-only image transport: decode the same checked-in bytes installed by seed:demo.
// Never bundled by an application. No synthetic UI pixels or asset network dependency.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/painting.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> get demoScenario =>
    jsonDecode(File('../../demo/scenario.json').readAsStringSync())
        as Map<String, dynamic>;
String demoImageUrl(String id) => 'http://127.0.0.1:5001/demo-image/$id.webp';
VoidCallback installDemoImageTransport() {
  final previous = debugNetworkImageHttpClientProvider;
  debugNetworkImageHttpClientProvider = () => _ImageClient();
  void restore() {
    debugNetworkImageHttpClientProvider = previous;
    imageCache.clear();
    imageCache.clearLiveImages();
  }

  addTearDown(restore);
  return restore;
}

class _ImageClient implements HttpClient {
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _ImageRequest(url);
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _ImageRequest implements HttpClientRequest {
  _ImageRequest(this.url);
  final Uri url;
  @override
  HttpHeaders get headers => _Headers();
  @override
  Future<HttpClientResponse> close() async {
    final id = url.pathSegments.last.replaceAll('.webp', '');
    final file = File('../../demo/assets/products/$id.webp');
    return _ImageResponse(file.existsSync() ? file.readAsBytesSync() : <int>[]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Headers implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _ImageResponse extends Stream<List<int>> implements HttpClientResponse {
  _ImageResponse(this.bytes);
  final List<int> bytes;
  @override
  int get statusCode => bytes.isEmpty ? 404 : 200;
  @override
  int get contentLength => bytes.length;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  StreamSubscription<List<int>> listen(void Function(List<int>)? onData,
          {Function? onError, void Function()? onDone, bool? cancelOnError}) =>
      Stream<List<int>>.value(bytes).listen(onData,
          onError: onError, onDone: onDone, cancelOnError: cancelOnError);
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
