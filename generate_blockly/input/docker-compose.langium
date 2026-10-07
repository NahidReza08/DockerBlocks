grammar DockerCompose

hidden terminal WS: /\s+/;

terminal ID: /[_a-zA-Z][\w_]*(?::[\w][\w.-]*)?/;
terminal INT: /[0-9]+/;
terminal STRING: /"[^\"]*"|'[^']*'/;

entry Compose:
    'compose' '{'
        (elements+=(Service | Network))+
    '}';

Service:
    'service' name=ID '{'
        (configuration+=(Image | Build | Restart | Healthcheck | Dependency | NetworkRef | Port | Environment | Volume))*
    '}';

Image:
    'image' image=ID;

Dependency:
    'depends_on' target=ID;

Build:
    'build' context=STRING;

Restart:
    'restart' policy=('no' | 'always' | 'on-failure' | 'unless-stopped');

Healthcheck:
    'healthcheck'
    'command' command=STRING
    'interval' interval=STRING
    'timeout' timeout=STRING
    'retries' retries=INT;

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
