import 'package:flutter_test/flutter_test.dart';
import 'package:dreamogic/main.dart';

void main() {
  testWidgets('DreamogicApp boots to home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const DreamogicApp());
    await tester.pumpAndSettle();

    expect(find.text('DREAMOGIC'), findsOneWidget);
    expect(find.text('The Lullaby (Story)'), findsOneWidget);
    expect(find.text('Dream Forge'), findsOneWidget);
    expect(find.text('Journal of Truths'), findsOneWidget);
  });
}
