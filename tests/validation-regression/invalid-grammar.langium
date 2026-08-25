grammar AddressBook

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT: /[0-9]+/;

entry AddressBook:
    (contacts+=Contact)*;

Contact:
    'contact' name=ID '{'
        (phones+=Phone | addresses+=Address)*
    '}';

Phone:
    'phone' number=INT;

Address:
    'address' city=ID
