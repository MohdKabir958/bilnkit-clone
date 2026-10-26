import 'package:vendor_app/services/push/push_message.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'support updates carry only validated case references, not a fabricated order',
      () {
    final data = <String, dynamic>{
      'event': 'SUPPORT_UPDATED',
      'orderId': '',
      'caseId': 'case-one',
      'noteId': 'note-one',
      'v': '1'
    };
    final parsed = PushMessage.fromData(data);
    expect(parsed.isActionable, isTrue);
    expect(parsed.event, PushEvent.supportUpdated);
    expect(parsed.caseId, 'case-one');
    expect(parsed.noteId, 'note-one');
    expect(PushMessage.fromPayload(parsed.toPayload()).caseId, 'case-one');
    expect(parsed.toPayload(), isNot(contains('private text')));
    for (final value in [
      {...data, 'caseId': ''},
      {...data, 'caseId': '../other'},
      {...data, 'noteId': 42},
      {...data, 'v': '2'},
      {...data}..remove('noteId')
    ]) {
      expect(PushMessage.fromData(value).isActionable, isFalse);
    }
  });
}
