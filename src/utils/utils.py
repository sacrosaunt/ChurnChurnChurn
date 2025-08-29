from urllib.parse import urlparse, parse_qs, urlunparse

def normalize_url_for_comparison(url):
    """Normalize URL by removing common referral parameters and fragments."""
    # Parse the URL
    parsed = urlparse(url)
    
    # Get query parameters
    query_params = parse_qs(parsed.query)
    
    # Remove common referral/tracking parameters
    referral_params = [
        'ref', 'referrer', 'referral', 'source', 'utm_source', 'utm_medium', 
        'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid',
        'mc_cid', 'mc_eid', 'affiliate', 'partner', 'tracking', 'campaign',
        'clickid', 'adid', 'ad_id', 'creative', 'placement', 'network',
        'device', 'device_type', 'platform', 'os', 'browser', 'geo',
        'country', 'region', 'city', 'zip', 'postal', 'state', 'province',
        'language', 'lang', 'locale', 'currency', 'timezone', 'timestamp',
        'session', 'user', 'visitor', 'customer', 'client', 'account',
        'member', 'subscriber', 'newsletter', 'email', 'phone', 'mobile',
        'desktop', 'tablet', 'ios', 'android', 'windows', 'mac', 'linux',
        'chrome', 'firefox', 'safari', 'edge', 'opera', 'ie', 'internet_explorer'
    ]
    
    # Remove referral parameters
    for param in referral_params:
        if param in query_params:
            del query_params[param]
    
    # Rebuild query string
    new_query = '&'.join([f"{k}={v[0]}" for k, v in query_params.items()]) if query_params else ''
    
    # Reconstruct URL without fragment and with cleaned query
    normalized_url = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        new_query,
        ''  # Remove fragment
    ))
    
    return normalized_url
