public with sharing class DokHost {
    /**
     * Return the public site host for the given Market_Unit__c.
     * Values are treated case-sensitively and returned only if mapped.
     */
    public static String forMarket(String market){
        Map<String,String> hostByMarket = new Map<String,String>{
            'DFJ_DK' => 'https://dok.dinfamiliejurist.dk',
            'FA_SE'  => 'https://dok.dinfamiljejurist.se',
            'Ireland'=> 'https://docs.hereslaw.ie'
        };
        return hostByMarket.get(market);
    }
}