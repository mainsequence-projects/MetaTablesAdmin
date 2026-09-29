# SDK resource-list phone spacing

The installed `@dev-mainsequence/command-center-sdk` version is 0.5.6.
At a 375×812 viewport, the public `ResourceListPage` with `searchable` and
`tablePresentation="auto"` correctly stacks its rows and has no horizontal
overflow. Its search toolbar reserves 256px vertically, leaving excess space.

The package styles set `.cc-resource-toolbar__search` to `flex: 1 1 16rem`,
then switch the toolbar to a column on phones without resetting that basis.
The public list should retain a normal control-height search row in the column
layout. This requires a fix in the SDK stylesheet; the consumer continues using
the published component without copying or overriding its layout.

This is a visual SDK-source maintenance issue. Public component inputs, normalized
resource adapter results, and serialized contracts do not need to change.


## Resource detail breadcrumb touch target

The published ResourceDetailShell renders its breadcrumb button at about
73 × 18 px. The SDK layout verifier flags it below the 24 px floor at coarse
pointer widths. Observed while checking the Security Access panel with SDK 0.5.6.
The panel itself and the standalone Security page are checked at 375 and 1280 px
in both themes; the application does not override SDK breadcrumb geometry.
The full verifier also reports detail-page overflow at 320 px, outside those
requested panel verification sizes. These shell findings remain for SDK work.
