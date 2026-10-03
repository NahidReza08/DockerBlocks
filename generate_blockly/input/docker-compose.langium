grammar DockerCompose

hidden terminal WS: /\s+/;

terminal ID: /[_a-zA-Z][\w_]*(?::[\w][\w.-]*)?/;
terminal INT: /[0-9]+/;
terminal STRING: /"[^\"]*"|'[^']*'/;

entry Compose:
    'compose' '{'
        (services+=Service)+
        (networks+=Network)*
    '}';

Service:
    'service' name=ID '{'
        'image' image=ID
        (dependencies+=Dependency)*
        (networks+=NetworkRef)*
        (ports+=Port)*
        (environments+=Environment)*
        (volumes+=Volume)*
    '}';

Dependency:
    'depends_on' target=ID;

NetworkRef:
    'network' target=ID;

Network:
    'network' name=ID ('driver' driver=ID)?;

Port:
    'port' host_port=INT '->' container_port=INT;

Environment:
    'environment' key=ID '=' value=(ID | INT);

Volume:
    'volume' source=STRING '->' target=STRING;
