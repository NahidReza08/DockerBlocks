project ComplexProject { metadata { 2 private }
member Alice manager
member Bob developer
member Carol tester
module Frontend frontend {
 component Dashboard typescript 350
 component ApiClient typescript 180
}
module Backend backend {
 component Server java 500
 component TestRunner python 220
}
task BuildDashboard high doing   8 {
 subtask CreateLayout yes
 subtask AddValidation no
}
task TestBackend medium todo   5 {
 subtask WriteTests no
 subtask RunIntegrationTests no
}
}
