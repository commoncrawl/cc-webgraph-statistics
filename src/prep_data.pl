#!/usr/bin/env perl

use strict;
use warnings;
use LWP::UserAgent;
use JSON::XS;
use Data::Dumper;
use List::Util qw(all);
use List::MoreUtils qw(pairwise);

our @headers;
our $lines;

sub println
{
    my ( $s )  = @_;
    print "$s\n";
}

sub arrays_equal
{
    my ( $a1, $a2 ) = @_;
    return 0 unless @$a1 == @$a2;
    return all { $_ == 0 } pairwise { $a cmp $b } @$a1, @$a2;
}

sub readstats
{
    my ( $file, $type, $release )  = @_;
    $release =~ s/-host(?:graph)?$//;
    open( my $fh, '<', $file ) or die "Could not open file '$file' $!";
    my @h;
    my @l;
    push @l, $release;
    # for my $line (sort <$fh>)
    while ( my $line = <$fh> )
    {
        chomp $line;
        if ( $line =~ m@^(.*?)=(.*)$@ )
        {
            push @h, $1;
            push @l, $2;
        }
    }
    close $fh;
    if ( !arrays_equal( \@h, \@headers ) )
    {
        print STDERR "Schema changed\n" if scalar @headers > 0;
        @headers = @h;
    }
    push @{ $lines->{ $type } }, join "\t", @l;
}

sub fetch_stats
{
    my ( $release, $type ) = @_;
    my $base_url = "https://data.commoncrawl.org/projects/hyperlinkgraph";
    my $url = "$base_url/$release/$type/$release-$type.stats";
    my $local_cache_file = "cache/$type/$release-$type.stats";
    # these are different
    if ($release eq 'cc-main-2017-aug-sep-oct'
        || $release eq 'cc-main-2017-may-jun-jul')
    {
        $url = "$base_url/$release/${type}graph/bvgraph.stats";
    }
    elsif ($release eq 'cc-main-2017-feb-mar-apr-hostgraph')
    {
        $url = "$base_url/$release/bvgraph.stats";
        $local_cache_file = "cache/$type/cc-main-2017-feb-mar-apr-host.stats";
    }
    print "Fetching $url -> $local_cache_file\n";
    my $ua = LWP::UserAgent->new;
    my $response = $ua->get($url);
    die "Failed to fetch $url: ", $response->status_line unless $response->is_success;
    open(CACHE, ">", $local_cache_file);
    print CACHE $response->decoded_content;
}

my $url = 'https://index.commoncrawl.org/graphinfo.json';
my $ua = LWP::UserAgent->new;
my $response = $ua->get($url);
die "Failed to fetch data: ", $response->status_line unless $response->is_success;

my $json = decode_json($response->decoded_content);
my @releases = map { $_->{id} } @$json;

my $stats;

for my $release ( reverse @releases )
{
    for my $type ( 'host', 'domain' )
    {
        my $file = "cache/$type/$release-$type.stats";
        if ($release eq 'cc-main-2017-feb-mar-apr-hostgraph')
        {
            next if $type ne 'host';
            $file = "cache/$type/cc-main-2017-feb-mar-apr-host.stats";
        }
        fetch_stats( $release, $type ) if ( !-e $file );
        $stats->{ $release }->{ $type } = readstats( $file, $type, $release );
    }
}

if ( !defined $ARGV[0] || $ARGV[0] ne 'host' && $ARGV[0] ne 'domain' )
{
    # println "Hint: $0 <domain|host>";
    exit;
}

println( "release\t" . join "\t", @headers );

for my $l ( @{ $lines->{ $ARGV[0] } } )
{
    println( $l );
}

1;
