grammar DockerCompose

hidden terminal WS: /\s+/;

terminal ID: /[_a-zA-Z][\w_]*(?::[\w][\w.-]*)?/;
terminal INT: /[0-9]+/;
terminal STRING: /"[^\"]*"|'[^']*'/;

entry Compose:
    'compose' '{'
        (services+=Service)+
    '}';

Service:
    'service' name=ID '{'
        'image' image=ID
        (ports+=Port)*
        (environments+=Environment)*
        (volumes+=Volume)*
    '}';

Port:
    'port' host_port=INT '->' container_port=INT;

Environment:
    'environment' key=ID '=' value=(ID | INT);

Volume:
    'volume' source=STRING '->' target=STRING;
