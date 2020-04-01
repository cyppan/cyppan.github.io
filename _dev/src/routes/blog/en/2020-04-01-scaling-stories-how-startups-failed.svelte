<script>
  export const title = "scaling stories: how startups failed"
  export const description = "During COVID-19, online services, especially meeting utilities or edtech programs, had to face a particularly sustained usage, enduring a unplanned and lasting peak load recently. Couldn't those businesses have anticipated more? Couldn't they have a stronger tech at the origin, exceptional event or not?"
  export const path = "/blog/en/2020-04-01-scaling-stories-how-startups-failed"
  export const url = "https://cyppan.me" + path;
</script>

<svelte:head>
  <title>
    @cyppan | {title}
  </title>
  <link rel="canonical" href="{url}">
  <meta property="og:title" content="@cyppan | {title}">
  <meta property="og:locale" content="en_US">
  <meta name="description" content="{description}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="@cyppan">
</svelte:head>

<section class="section">
  <div class="container">
  <div class="box">
  <div class="container content">
    <h1 class="title is-2" style="text-align: center">
      {title}
    </h1>
    <blockquote>
    <ul>
        <li>"It doesn't work at all, my children can't connect to the online class !"</li>
        <li>"We're very sorry about that it's an exceptional situation, we're working on the problem with our tech team and will keep you posted."</li>
    </ul>
    </blockquote>
    <p>
      It is the kind of tweet & LinkedIn messages that have exploded during those recent COVID-times. 
      Indeed, online services, especially meeting utilities or edtech programs, had to face a particularly sustained usage, enduring a unplanned and lasting peak load. 
      I've seen only a few able to maintain an acceptable quality of service (at least, Slack and Zoom have shined with their professionnalism for what I could see), 
      the bigger part having to establish a connection queue for its clients, or even to shutdown their entire service for an endless "maintenance".
    </p>
    <p>
      Even being comprehensive, when facing an online service availability problem, we're very quick to change. 
      After all why shouldn't we benefit for the plethora of offering at our disposal? 
      And after the crisis has passed, it's highly expected that we'll see no reason to change, no reason to go back to the initial fancy startup product we were using at the origin.
      For a startup that's a lot of clients lost, maybe enough to not be able to start the traction back. Terrible death for a business, another virus victim.
    </p>
    <p>
      But 🧐
    </p>
    <ul>
      <li><strong>Couldn't those businesses have anticipated more?</strong></li>
      <li><strong>Couldn't they have a stronger tech at the origin, exceptional event or not?</strong></li>
      <li><strong>Once facing the problem, couldn't they adapt better and faster?</strong></li>
    </ul>


    <h1 class="title is-3">
      <a id="scaling-maturity-model" href="{path}#scaling-maturity-model"># The scaling maturity model</a>
    </h1>

    <div style="text-align:center">
      <img src="/scaling-maturity.png" class="is-center">
    </div>

    <p>
      First, I want to introduce what I will call a company "scaling maturity". 
      Scaling is the art of adapt (automatically of not) your tech stack to handle the incoming demand. 
      And to be fair <strong>Zoom and Slack</strong> are far more mature companies than (for example) recently-born edtech startups.<br />
      Let's analyze them using the scaling maturity model.
    </p>
    <p>
      <strong>1 - Nominal usage load:</strong> Slack or Zoom already had a big traffic before, the peak represents a smaller percentage of their total nominal traffic compared to a startup for which it is maybe 100 or 1000 times bigger than usual.<br />
      <strong>2 - product maturity:</strong> They've had time to know the specificity of their usage, the way the data is accessed, their systems points of failure, etc...<br />
      <strong>3 - technical skills:</strong> They probably have a bigger and more experienced tech team.
    </p>
    <p>
      To synthetize, they know a lot about how their product is used and where they are going, and so know a lot about where to focus, and what kind of effort they need to do to adapt to the extra demand. Plus their current architecture can already sustain some load.
    </p>
    <p>
      On the other side, young online services were just overflowed, calling for help, trying desperatly to find solutions to shard and replicate their existing relational databases (more on that later).<br />
      I'll take an hypothetical example of an <strong>edtech startup</strong> offering innovative online class services
    </p>
    <p>
      <strong>1 - Nominal usage load:</strong> Some clients like what they do, it's the future, they believe in their capability to grow and propose more features with time. 
      So there is a light load for now and a steady growth expected, they've opted for several cheap OVH servers.<br />
      <strong>2 - product maturity:</strong> It's basically innovative education R&D so they have a very young product.<br />
      <strong>3 - technical skills:</strong> Interns, probably young employees, sometimes founder-made prototypes. At this point salaries weigh a lot...
    </p>
    <p>
      I'll make a preliminary conclusion to the first question: businesses couldn't have anticipated and even, for the smaller ones, wasn't expected to have...
      Indeed, if one wants to design a product with "infinite" (or easy to add) scaling from scratch, this will cost him a lot of <strong>money and time</strong>. 
      Two scarse resources you rationnaly prefer to invest in other things when you're a small business (finding product-market fit, adding features, growing, ...)
    </p>

    <blockquote>
    <div class="columns">
      <div class="column is-one-quarter">
        <img alt="black swan Image by Holger Detje from Pixabay" src="/black-swan.jpg" />
      </div>
      <div class="column">
        Covid-19 is a very good example of a <a href="https://en.wikipedia.org/wiki/Black_swan_theory" target="_blank">black swan</a> event.
        An event that is very rare, has massive implications, and so for which companies haven't planned for.<br />
        Indeed, this point is pretty obvious. We'll call it the "bird pause" 😉 
      </div>
    </div>
    </blockquote>

    <p>
      I've recently talked with several young edtech companies looking urgently for solutions.
      They were facing the same issue: their <strong>relational database could not scale anymore</strong> (mysql or postgres). 
      They were trying to add cache, pop new replica nodes, refactoring their apps and services, and their final blocker was the database...
      The only remaining solution was to <strong>scale writes horizontally</strong> (to shard). So they were looking for some smart proxy solutions to put in front 
      allowing the database to scale seamlessly. Not that straightforward though... And not that cheap. <br />
      And I don't even talk about managing the <strong>migration</strong> in that context!<br />
    </p>
    <p>
      To have an idea about how hard it is to shard an existing database I would say that the more <em>complex and global</em> querying you have in place (like cross-accounts data aggregation)
      the more <em>smart and expensive</em> the front proxy will have to be. It goes from a quite simple hash-distribution routing, to a very complex (and hard-to-scale too) query planner.
    </p>
    <p>
      In light of the scaling maturity model, it's quite clear we can't blame them for not having the scaling mechanisms in place before, 
      but at least they could have planned better for their <strong>next scaling step</strong>.
    </p>


    <h1 class="title is-3">
      <a id="scale-efficiently" href="{path}#scale-efficiently"># Then... how to scale efficiently as a startup?</a>
    </h1>   

    <p>
      We can deconstruct first what is to be "scaled"
    </p>
    <ul>
      <li><strong>servers capacity</strong>: costs will force you to dimension correctly their size (cpu / ram / storage). They could be physical, virtual, or containers.</li>
      <li><strong>data access patterns</strong>: better know your usage, avoid shared state and global querying and prefer immutability.</li>
      <li><strong>human intervention & maintenance</strong>: "the more you automate, the faster you iterate" (Github, CI/CD, terraform, ...).</li>
      <li><strong>code refactoring</strong>: to scale ofter means pre-compute things, use smart caching, more synchronization, all of this has to be coded and maintained at some point.</li>
    </ul>

    <p>
    <em>
    Note: if your product does not have any real traction yet, you probably shouldn't think about this at all for now, a good old MVC prototype with whatever tech you already know will do the job.
    </em>
    </p>

    <p>If you already have some usage, and have a first idea of where your business is going, then there are several possibilities. 
    If you have at your disposal a strong technical founder, he probably already knows what to do.
    Otherwise, especially if you did get some founding, it would be a good idea to get someone experimented enough helping you setup the infrastructure at the beginning.
    </p>

    <p>Let's explore then two different strategies</p>
    
    <h2 class="subtitle is-4">The infinite scaling strategy</h2>

    <p>
      Well I prefer to immediately debunk the myth, it's theoretically possible to <strong>approach</strong> such an architecture but it will be very expensive, and possibly quite rigid.<br />
      The key here would be to use a lot of high level managed services who run on giant cloud infrastructures. 
      The services choosen should be 100% dynamic, I mean scale transparently : you shouldn't have to manage any physical nodes directly.
      They better have included and transparent replication (to scale reads) and sharding capabilities (to scale writes) and be able to be geographically dispatched in several regions on the planet.<br />
    </p>
    <p>
      Here some managed services examples:
    </p>
    <ul>
      <li>Relational datastore: Google cloud spanner</li>
      <li>NoSQL real time sync datastore: Google firestore</li>
      <li>Replicated cache: AWS Elasticache</li>
      <li>Distributed File storage: AWS S3</li>
      <li>Data streaming: Google pubsub</li>
      <li>Columnar-storage (optimized for aggregation) Data lake: Google Bigquery</li>
    </ul>

    <p>
      <em>Yes, that's a lot of GCP services, to be honest they are ahead..!</em>
    </p>

    <div style="text-align:center">
      <img src="/dynamic-scaling-curve.png" class="is-center">
    </div>
    <em>Actually I have to nuance the curve a bit: </em>
    <ul>
      <li>Price is actually super low at the very beginning: services often offer free plan for a limited volume or during a limited period</li>
      <li>On the other side, costs can decrease when you reach a big volume because of degressive pricing, or by using provider specific cost optimization techniques</li>
    </ul>

    <h2 class="subtitle is-4">The step by step scaling strategy</h2>
    <div style="text-align:center">
      <img src="/static-scaling-curve.png" class="is-center">
    </div>
    <p>
      This is the usual and probably the most efficient strategy, you do with what you have at first (skills, people, ...), but you always stay a step ahead, 
      you are conscious about what your system points of failure are, and how to resolve them. You plan carefully for 
      the next system migrations. This requires specifically:
    </p>
    <ul>
      <li>To develop a strong <strong>monitoring and alerting pipeline</strong>. You have plenty of tools to do that easily nowadays.</li>
      <li>To <strong>test every migration</strong> before. The more the system is distributed, the harder the problems will be predictable. It's easier to just test it.</li>
    </ul>
    <p>
      As examples, the scaling next step could be: 
    </p>
    <ul>
      <li>Shard the database or the streaming pipeline</li>
      <li>Introduce automatic scaling of your HTTP services</li>
      <li>Refactor your application to isolate your data in silos, introduce some kind of load balancing, and replicate parts of your system</li>
    </ul>

    <p>
    <em>
      Note: smart scaling is specific scaling, so every case has a different story..!
    </em>
    </p>
    <p>
      To conclude, the right solution probably lies in between the two strategies. It depends on your budget, the technical complexity of your product, and the skills you have at your disposal.<br />
      At least I hope you have now new ideas about how to better anticipate scale !
    </p>
    <br />
    <p>
      <strong>Scale safe 👋</strong><br />
      By the way if you have scaling needs / specific questions, <a href="/">I'd be happy to help</a>
    </p>
    <br />
    <div id="disqus_thread"></div>
  </div>
  </div>
  </div>
</section>

<style>
.container {
  text-align: justify;
  font-size: 1.1em;
  padding: 0.5em;
}
.title.is-3 {
  margin-top: 2em;
}
.subtitle.is-4 {
  margin-top: 1em;
}
</style>
