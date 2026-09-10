grammar DockerCompose

hidden terminal WS: /\s+/;

terminal ID: /[_a-zA-Z][\w_]*/;

entry Compose:
    'compose' '{'
        (services+=Service)+
    '}';

Service:
    'service' name=ID '{'
        'image' image=ID
    '}';
