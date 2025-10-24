@IsTest
private class DokHost_Test {
    @IsTest
    static void map_returns_expected() {
        System.assertEquals('https://dok.dinfamiliejurist.dk', DokHost.forMarket('DFJ_DK'));
        System.assertEquals('https://dok.dinfamiljejurist.se', DokHost.forMarket('FA_SE'));
        System.assertEquals('https://docs.hereslaw.ie', DokHost.forMarket('Ireland'));
        System.assertEquals(null, DokHost.forMarket('UNKNOWN')); // unmapped returns null
    }
}